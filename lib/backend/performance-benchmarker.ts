import { commands, setInvokeLogger } from "@/lib/backend/commands";

export interface BenchmarkResult {
    command: string;
    runs: number;
    meanMs: number;
    medianMs: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
}

class PerformanceBenchmarker {
    private latencies: Record<string, number[]> = {};
    private isTracking = false;

    constructor() {
        this.initializeTracker();
    }

    private initializeTracker() {
        setInvokeLogger((command, durationMs) => {
            if (!this.isTracking) return;
            if (!this.latencies[command]) {
                this.latencies[command] = [];
            }
            this.latencies[command].push(durationMs);
        });
    }

    public startTracking() {
        this.latencies = {};
        this.isTracking = true;
        console.log("[PerformanceBenchmarker] Tracking started.");
    }

    public stopTracking(): Record<string, number[]> {
        this.isTracking = false;
        console.log("[PerformanceBenchmarker] Tracking stopped.");
        return this.latencies;
    }

    public getReport(): BenchmarkResult[] {
        const report: BenchmarkResult[] = [];
        for (const [command, times] of Object.entries(this.latencies)) {
            if (times.length === 0) continue;
            const sorted = [...times].sort((a, b) => a - b);
            const sum = sorted.reduce((a, b) => a + b, 0);
            const mean = sum / sorted.length;
            const median = sorted[Math.floor(sorted.length / 2)];
            const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
            report.push({
                command,
                runs: times.length,
                meanMs: Number(mean.toFixed(3)),
                medianMs: Number(median.toFixed(3)),
                p95Ms: Number(p95.toFixed(3)),
                minMs: Number(sorted[0].toFixed(3)),
                maxMs: Number(sorted[sorted.length - 1].toFixed(3)),
            });
        }
        return report;
    }

    public async runAutomatedBenchmarks() {
        console.log("[PerformanceBenchmarker] Running automated performance benchmarks...");
        this.startTracking();

        // 1. Benchmark Outline Parsing (Tree-sitter)
        const smallCode = `function add(a: number, b: number) { return a + b; }`;
        const mediumCode = Array.from({ length: 200 }, (_, i) => `function testFunc${i}() { return ${i}; }`).join("\n");
        const largeCode = Array.from({ length: 2000 }, (_, i) => `function heavyTestFunc${i}() { return ${i}; }`).join("\n");

        console.log("- Benchmarking AST Parsing Subsystem (get_outline)...");
        for (let i = 0; i < 50; i++) {
            await commands.getOutline("test.ts", smallCode, "ts", i);
        }
        for (let i = 0; i < 30; i++) {
            await commands.getOutline("test_med.ts", mediumCode, "ts", i);
        }
        for (let i = 0; i < 10; i++) {
            await commands.getOutline("test_large.ts", largeCode, "ts", i);
        }

        // 2. Benchmark Git operations if project path is set
        const state = await commands.getProjectState();
        if (state.project_path) {
            console.log("- Benchmarking Version Control Visualizer commands...");
            for (let i = 0; i < 20; i++) {
                await commands.gitStatus(state.project_path);
            }
        }

        this.stopTracking();
        const report = this.getReport();
        console.table(report);
        return report;
    }

    // Measure UI frame rendering latency
    public measureFPS(durationMs: number = 3000): Promise<number> {
        return new Promise((resolve) => {
            let frames = 0;
            const start = performance.now();
            
            const tick = () => {
                frames++;
                const elapsed = performance.now() - start;
                if (elapsed < durationMs) {
                    requestAnimationFrame(tick);
                } else {
                    const fps = (frames * 1000) / elapsed;
                    console.log(`[PerformanceBenchmarker] Measured FPS: ${fps.toFixed(1)}`);
                    resolve(fps);
                }
            };
            requestAnimationFrame(tick);
        });
    }
}

export const performanceBenchmarker = new PerformanceBenchmarker();

if (typeof window !== "undefined") {
    const globalWindow = window as unknown as Record<string, unknown>;
    globalWindow.shapePerformance = performanceBenchmarker;
    globalWindow.runPerformanceBenchmarks = () => performanceBenchmarker.runAutomatedBenchmarks();
}
