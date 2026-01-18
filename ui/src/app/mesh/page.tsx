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

import { MeshHUD } from '@/components/mesh/MeshHUD';

export default function MeshTopologyPage() {
    return (
        <div className="w-full h-full min-h-screen bg-black">
            <MeshHUD />
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
