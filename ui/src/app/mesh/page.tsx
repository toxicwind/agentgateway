import React, { useEffect, useState, useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell } from 'recharts';
import * as d3 from 'd3';

interface MeshNode {
    serviceName: string;
    transport: string;
    port: number;
    activeSessions: number;
    pid?: number;
    samplingSupported: boolean;
    identityTrust: number; // 0-1, 1 = blessed
}

export default function MeshTopologyPage() {
    const [nodes, setNodes] = useState<MeshNode[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNodes = async () => {
            try {
                const response = await fetch('/mesh/nodes');
                const data = await response.json();
                setNodes(data.map((h: any) => ({
                    ...h,
                    identityTrust: 1.0, // Hardcore Merge always blesses for now
                })));
            } catch (err) {
                console.error('Failed to fetch mesh nodes', err);
            } finally {
                setLoading(false);
            }
        };

        fetchNodes();
        const interval = setInterval(fetchNodes, 5000);
        return () => clearInterval(interval);
    }, []);

    // Filter dynamic nodes
    const agentNodes = nodes.filter(n => n.serviceName.startsWith('node-'));
    const systemNodes = nodes.filter(n => !n.serviceName.startsWith('node-'));

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        Emergent Swarm Topology
                    </h1>
                    <p className="text-muted-foreground mt-2">Fluid Mesh Convergence (Native ADP Projection)</p>
                </div>
                <div className="flex gap-4">
                    <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-mono">
                        Active Nodes: {nodes.length}
                    </div>
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-mono">
                        Live Sessions: {nodes.reduce((acc, n) => acc + n.activeSessions, 0)}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 aspect-video bg-black/40 border border-white/5 rounded-3xl overflow-hidden relative shadow-2xl backdrop-blur-xl group">
                    {/* High-Fidelity Visualization Wrapper */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent opacity-50 pointer-events-none" />
                    <div className="flex items-center justify-center h-full">
                        {loading ? (
                            <div className="animate-pulse flex flex-col items-center">
                                <div className="w-12 h-12 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                                <span className="mt-4 text-blue-400/50 font-mono text-xs">RECONCILING ADP...</span>
                            </div>
                        ) : nodes.length === 0 ? (
                            <div className="text-center">
                                <p className="text-white/20 font-mono italic">Waiting for heartbeats...</p>
                            </div>
                        ) : (
                            <SwarmForceMap nodes={nodes} />
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                        Live Swarm Log
                    </h3>
                    <div className="bg-black/60 border border-white/5 rounded-2xl h-[400px] overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar shadow-inner">
                        {/* This would be backed by the /mesh/logs endpoint */}
                        <div className="text-emerald-400/70">[10:12:41] [INF] Mesh registry initialized. Waiting for blessed heartbeats...</div>
                        <div className="text-blue-400/70">[10:12:45] [UDP] Identity Sync: node-7f8a1e blessed with X-Mesh-Token</div>
                        <div className="text-white/40">[10:12:48] [LOG] leaf-7f8a1e: SSE session created (0xde1)</div>
                        <div className="text-emerald-400/70">[10:12:50] [ADP] Projecting node-7f8a1e into native data plane</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SwarmForceMap({ nodes }: { nodes: MeshNode[] }) {
    // Use a Force-Directed Layout approach using Recharts as a high-level wrapper
    // For 2026 aesthetics, we want fluid circles with gravity
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="x" name="stature" hide domain={[-100, 100]} />
                <YAxis type="number" dataKey="y" name="influence" hide domain={[-100, 100]} />
                <ZAxis type="number" dataKey="activeSessions" range={[100, 2000]} name="sessions" />
                <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                />
                <Scatter name="Swarm Nodes" data={nodes.map((n, i) => ({
                    ...n,
                    x: Math.cos(i * (2 * Math.PI / nodes.length)) * 60,
                    y: Math.sin(i * (2 * Math.PI / nodes.length)) * 60,
                }))}>
                    {nodes.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.serviceName.startsWith('node-') ? '#34d399' : '#60a5fa'}
                            stroke={entry.identityTrust === 1 ? '#fff' : '#ef4444'}
                            strokeWidth={entry.identityTrust === 1 ? 0.5 : 2}
                            className="drop-shadow-[0_0_10px_rgba(52,211,153,0.3)] transition-all duration-500 hover:scale-110"
                        />
                    ))}
                </Scatter>
            </ScatterChart>
        </ResponsiveContainer>
    );
}
