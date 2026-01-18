"use client";

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Shield, Zap, Info, AlertCircle } from "lucide-react";

interface MeshHeartbeat {
    serviceName: string;
    transport: "sse" | "streamable";
    port: number;
    activeSessions: number;
    isBlessed: boolean;
}

interface MeshEvent {
    nodeUpdated?: MeshHeartbeat;
    nodeRemoved?: string;
}

export const MeshHUD: React.FC = () => {
    const [nodes, setNodes] = useState<Record<string, MeshHeartbeat>>({});
    const [logs, setLogs] = useState<{ id: string; msg: string; type: string }[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const liquidRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sse = new EventSource("http://localhost:15000/mesh/events");
        sse.onmessage = (ev) => {
            try {
                const event: MeshEvent = JSON.parse(ev.data);
                if (event.nodeUpdated) {
                    const node = event.nodeUpdated;
                    setNodes((prev) => ({ ...prev, [node.serviceName]: node }));
                    addLog(`Node Up: ${node.serviceName} (${node.transport}:${node.port})`, "info");
                } else if (event.nodeRemoved) {
                    const name = event.nodeRemoved;
                    setNodes((prev) => {
                        const next = { ...prev };
                        delete next[name];
                        return next;
                    });
                    addLog(`Node Down: ${name}`, "warn");
                }
            } catch (e) {
                console.error("Failed to parse mesh event", e);
            }
        };
        return () => sse.close();
    }, []);

    const addLog = (msg: string, type: "info" | "warn" | "error") => {
        setLogs((prev) => [{ id: Math.random().toString(36), msg, type }, ...prev].slice(0, 10));
    };

    useGSAP(() => {
        if (liquidRef.current) {
            gsap.to(liquidRef.current, {
                borderRadius: "40% 60% 70% 30% / 40% 50% 60% 50%",
                duration: 3,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut",
            });
            gsap.to(liquidRef.current, {
                rotate: 360,
                duration: 20,
                repeat: -1,
                ease: "linear",
            });
        }
    }, { scope: containerRef });

    return (
        <div ref={containerRef} className="relative w-full h-full min-h-[500px] bg-black overflow-hidden font-mono text-white p-8">
            {/* Liquid Glassmorphism Background */}
            <div
                ref={liquidRef}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-purple-500/20 to-blue-500/20 rounded-full blur-3xl"
            />

            {/* HUD Content */}
            <div className="relative z-10 grid grid-cols-12 gap-8 h-full">
                {/* Left: Mesh Nodes */}
                <div className="col-span-8 border border-white/20 backdrop-blur-xl bg-white/5 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                        <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-2">
                            <Activity className="text-purple-400" />
                            Mesh Topography
                        </h2>
                        <div className="text-xs uppercase text-white/40">
                            Uptime: <span className="text-white">STABLE</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AnimatePresence>
                            {Object.values(nodes).map((node) => (
                                <motion.div
                                    key={node.serviceName}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="border border-white/10 bg-white/5 p-4 rounded hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-lg font-bold">{node.serviceName}</span>
                                        {node.isBlessed && (
                                            <Shield className="w-4 h-4 text-green-400" title="Blessed" />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[10px] uppercase text-white/60">
                                        <div>Port: <span className="text-white">{node.port}</span></div>
                                        <div>Transport: <span className="text-white">{node.transport}</span></div>
                                        <div>Sessions: <span className="text-white">{node.activeSessions}</span></div>
                                        <div>Status: <span className="text-green-400">ACTIVE</span></div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {Object.keys(nodes).length === 0 && (
                            <div className="col-span-2 py-20 text-center text-white/20 uppercase tracking-widest">
                                Searching for heartbeats...
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Metrics & Logs */}
                <div className="col-span-4 flex flex-col gap-8">
                    {/* Metrics Pane */}
                    <div className="border border-white/20 backdrop-blur-xl bg-white/5 p-6 rounded-lg flex-1">
                        <h3 className="text-sm font-black uppercase mb-4 tracking-wider flex items-center gap-2">
                            <Zap className="text-yellow-400 w-4 h-4" />
                            Pulse Logs
                        </h3>
                        <div className="space-y-4 overflow-y-auto max-h-[300px] scrollbar-hide">
                            {logs.map((log) => (
                                <div key={log.id} className="text-[10px] flex gap-2">
                                    <span className="text-white/30">[{new Date().toLocaleTimeString()}]</span>
                                    <span className={log.type === "warn" ? "text-yellow-400" : "text-blue-400"}>
                                        {log.msg}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* System Info */}
                    <div className="border border-white/20 backdrop-blur-xl bg-white/5 p-6 rounded-lg">
                        <h3 className="text-sm font-black uppercase mb-4 tracking-wider flex items-center gap-2">
                            <Info className="text-blue-400 w-4 h-4" />
                            Identity
                        </h3>
                        <div className="space-y-2 text-[10px] uppercase text-white/40">
                            <div className="flex justify-between">
                                <span>Mesh ID:</span>
                                <span className="text-white">HYPER-2026-BLESSED</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Protocol:</span>
                                <span className="text-white">STREAMABLE-HTTP/SSE</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
"
