"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ModelCameraHook = {
    azimuth: number;
    polar: number;
    distance: number;
};

type ThreeModule = typeof import("three");

function webglAvailable(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        return false;
    }
}

export async function loadGltfScene(THREE: ThreeModule, src: string) {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    return new Promise<import("three").Group>((resolve, reject) => {
        loader.load(src, (gltf) => resolve(gltf.scene), undefined, reject);
    });
}

/** Interactive GLB viewer. three.js is loaded only when this card mounts. */
export function ModelPreview({
    src,
    className,
    onReady,
    onError,
}: {
    src: string;
    className?: string;
    onReady?: (hook: ModelCameraHook) => void;
    onError?: (message: string) => void;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const hookRef = useRef<ModelCameraHook>({ azimuth: 0, polar: 0, distance: 0 });
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !src) return;
        if (!webglAvailable()) {
            const message = "WebGL is not available in this session.";
            setFailed(message);
            onError?.(message);
            return;
        }
        let disposed = false;
        let renderer: import("three").WebGLRenderer | undefined;
        let controls: { dispose: () => void } | undefined;
        let frame = 0;

        const boot = async () => {
            const THREE = await import("three");
            const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
            if (disposed || !hostRef.current) return;
            const width = host.clientWidth || 360;
            const height = host.clientHeight || 280;
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(width, height);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            host.appendChild(renderer.domElement);
            renderer.domElement.setAttribute("data-model-canvas", "1");

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x141414);
            const camera = new THREE.PerspectiveCamera(45, width / Math.max(height, 1), 0.01, 100);
            camera.position.set(1.8, 1.4, 2.2);

            const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
            scene.add(hemi);
            const key = new THREE.DirectionalLight(0xffffff, 1.4);
            key.position.set(2.4, 4, 2);
            scene.add(key);
            const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
            fill.position.set(-3, 1, -2);
            scene.add(fill);

            const orbit = new OrbitControls(camera, renderer.domElement);
            orbit.enableDamping = true;
            orbit.dampingFactor = 0.08;
            controls = orbit;

            const root = await loadGltfScene(THREE, src);
            if (disposed) return;
            scene.add(root);
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3()).length() || 1;
            const center = box.getCenter(new THREE.Vector3());
            root.position.sub(center);
            camera.near = size / 100;
            camera.far = size * 20;
            camera.updateProjectionMatrix();
            camera.position.copy(center).add(new THREE.Vector3(size * 0.7, size * 0.45, size * 0.7));
            orbit.target.set(0, 0, 0);
            orbit.update();

            const publish = () => {
                hookRef.current = {
                    azimuth: orbit.getAzimuthalAngle(),
                    polar: orbit.getPolarAngle(),
                    distance: orbit.getDistance(),
                };
                if (typeof window !== "undefined") {
                    (window as Window & { __shapeModelCamera?: ModelCameraHook }).__shapeModelCamera =
                        hookRef.current;
                }
                onReady?.(hookRef.current);
            };
            publish();

            const draw = () => {
                if (disposed) return;
                orbit.update();
                renderer?.render(scene, camera);
                frame = requestAnimationFrame(draw);
            };
            draw();

            const onResize = () => {
                if (!renderer || !hostRef.current) return;
                const nextW = hostRef.current.clientWidth || width;
                const nextH = hostRef.current.clientHeight || height;
                renderer.setSize(nextW, nextH);
                camera.aspect = nextW / Math.max(nextH, 1);
                camera.updateProjectionMatrix();
            };
            window.addEventListener("resize", onResize);
            renderer.domElement.addEventListener("pointerup", publish);
            renderer.domElement.addEventListener("wheel", publish, { passive: true });
        };

        void boot().catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            setFailed(message);
            onError?.(message);
        });

        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            controls?.dispose();
            if (renderer) {
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
    }, [src, onError, onReady]);

    if (failed) {
        return (
            <p className="my-2 text-sm text-text-muted" data-model-error="">
                {failed}
            </p>
        );
    }

    return (
        <div
            ref={hostRef}
            className={cn("relative h-[280px] w-full max-w-[360px] overflow-hidden rounded-[18px] bg-surface-3", className)}
            data-model-preview=""
        />
    );
}
