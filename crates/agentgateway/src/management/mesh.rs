use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};
use tokio::time;

use crate::store::Stores;
use crate::types::proto::agent::Resource as ADPResource;
use crate::types::proto::agent::resource::Kind as XdsKind;
use crate::types::proto::agent::{
    Backend as XdsBackend, ResourceName as XdsResourceName, McpBackend as XdsMcpBackend,
    McpTarget as XdsMcpTarget,
};
use crate::types::agent::{
    McpTargetSpec, SseTargetSpec, StreamableHTTPTargetSpec, Target,
};
use crate::types::local::SimpleLocalBackend as XdsSimpleBackendReference;
use crate::types::proto::agent::backend::Kind as XdsBackendKind;

use agent_core::strng;

use serde::{Deserialize, Serialize};
use agent_xds::{XdsUpdate, Handler};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TransportType {
    Sse,
    Streamable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshHeartbeat {
    pub service_name: String,
    pub transport: TransportType,
    pub port: u16,
    pub active_sessions: usize,
    /// Future-proofing for eBPF localhost bypass
    pub pid: Option<u32>,
    pub addr: Option<SocketAddr>,
    /// MCP Sampling capability
    #[serde(default)]
    pub sampling_supported: bool,
    /// Matrix Guardian: Cryptographically blessed status
    #[serde(default)]
    pub is_blessed: bool,
}

pub struct MeshNode {
    pub metadata: MeshHeartbeat,
    pub last_seen: Instant,
    pub token: String,
}

#[derive(Clone)]
pub struct MeshRegistry {
    stores: Stores,
    nodes: Arc<RwLock<HashMap<String, MeshNode>>>,
}

impl MeshRegistry {
    pub fn new(stores: Stores) -> Self {
        let registry = Self {
            stores,
            nodes: Arc::new(RwLock::new(HashMap::new())),
        };

        // Start Self-Healing Loop (Zombie Cleanup)
        let registry_clone = registry.clone();
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                registry_clone.cleanup_zombies();
            }
        });

        registry
    }

    pub fn register(&self, heartbeat: MeshHeartbeat, provided_token: Option<String>) -> anyhow::Result<String> {
        let mut nodes = self.nodes.write().unwrap();
        let name = heartbeat.service_name.clone();
        
        // Matrix Guardian: Strict Policy Enforcement
        let mut is_blessed = false;
        if let Some(existing) = nodes.get(&name) {
            if let Some(token) = provided_token {
                if existing.token != token {
                    warn!(service=%name, "Matrix Guardian: Identity theft detected (invalid token)");
                    anyhow::bail!("invalid mesh token for service {}", name);
                }
                is_blessed = true; // Still blessed if token matches
            } else {
                warn!(service=%name, "Matrix Guardian: Anonymous heartbeat rejected for existing service");
                anyhow::bail!("mesh token required for existing service {}", name);
            }
        } else if provided_token.is_none() {
            info!(service=%name, "Matrix Guardian: Blessing new ephemeral node");
        }

        let token = provided_token.unwrap_or_else(|| {
            use rand::{distr::Alphanumeric, Rng};
            rand::rng()
                .sample_iter(&Alphanumeric)
                .take(32)
                .map(char::from)
                .collect()
        });

        debug!(service=%name, transport=?heartbeat.transport, port=%heartbeat.port, "processing mesh heartbeat");

        nodes.insert(name.clone(), MeshNode {
            metadata: MeshHeartbeat {
                is_blessed,
                ..heartbeat.clone()
            },
            last_seen: Instant::now(),
            token: token.clone(),
        });

        // Project into ADP
        self.project_to_adp(heartbeat)?;

        Ok(token)
    }

    fn cleanup_zombies(&self) {
        let now = Instant::now();
        let mut to_remove = Vec::new();

        {
            let nodes = self.nodes.read().unwrap();
            for (name, node) in nodes.iter() {
                if now.duration_since(node.last_seen) > Duration::from_secs(90) {
                    to_remove.push(name.clone());
                }
            }
        }

        if !to_remove.is_empty() {
            let mut nodes = self.nodes.write().unwrap();
            for name in to_remove {
                warn!(service=%name, "mesh node heartbeat timed out, evicting zombie from ADP");
                nodes.remove(&name);
                let _ = self.evict_from_adp(&name);
            }
        }
    }

    fn evict_from_adp(&self, service_name: &str) -> anyhow::Result<()> {
        let backend_key = format!("mesh-{}", service_name);
        let update = XdsUpdate::Remove(backend_key.into());

        self.stores.binds.handle(Box::new(&mut std::iter::once(update)))
            .map_err(|e| anyhow::anyhow!("failed to evict mesh resource: {:?}", e))?;
        
        Ok(())
    }

    fn project_to_adp(&self, hb: MeshHeartbeat) -> anyhow::Result<()> {
        let backend_key = format!("mesh-{}", hb.service_name);
        
        let target_spec = match hb.transport {
            TransportType::Sse => McpTargetSpec::Sse(SseTargetSpec {
                backend: XdsSimpleBackendReference::Opaque(Target::Tcp(
                    "localhost".to_string().into(),
                    hb.port,
                )),
                path: "/sse".to_string().into(),
            }),
            TransportType::Streamable => McpTargetSpec::Mcp(StreamableHTTPTargetSpec {
                backend: XdsSimpleBackendReference::Opaque(Target::Tcp(
                    "localhost".to_string().into(),
                    hb.port,
                )),
                path: "/mcp".to_string().into(),
            }),
        };

        let xds_backend = XdsBackend {
            key: backend_key.clone(),
            name: Some(XdsResourceName {
                name: hb.service_name.clone(),
                namespace: "default".to_string(),
            }),
            kind: Some(XdsBackendKind::Mcp(XdsMcpBackend {
                targets: vec![XdsMcpTarget {
                    name: "primary".to_string().into(),
                    spec: target_spec,
                }],
                stateful_mode: None,
                prefix_mode: None,
            })),
            inline_policies: vec![],
        };

        let resource = ADPResource {
            kind: Some(XdsKind::Backend(xds_backend)),
        };

        let update = XdsUpdate::Update(agent_xds::XdsResource {
            name: strng::new(&backend_key),
            resource,
        });

        self.stores.binds.handle(Box::new(&mut std::iter::once(update)))
            .map_err(|e| anyhow::anyhow!("failed to inject mesh resource: {:?}", e))?;

        Ok(())
    }

    pub fn get_nodes(&self) -> Vec<MeshHeartbeat> {
        self.nodes.read().unwrap().values().map(|n| n.metadata.clone()).collect()
    }

    pub fn validate_token(&self, service_name: &str, token: &str) -> bool {
        let nodes = self.nodes.read().unwrap();
        nodes.get(service_name).map(|n| n.token == token).unwrap_or(false)
    }
}
