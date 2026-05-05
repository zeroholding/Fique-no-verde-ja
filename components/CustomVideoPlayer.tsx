"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";

interface CustomVideoPlayerProps {
    src: string;
}

export function CustomVideoPlayer({ src }: CustomVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState("0:00");
    const [duration, setDuration] = useState("0:00");
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);

    let controlsTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Auto-play might be blocked by browsers, but we try
        video.play().catch(() => setIsPlaying(false));
    }, [src]);

    const formatTime = (timeInSeconds: number) => {
        const m = Math.floor(timeInSeconds / 60);
        const s = Math.floor(timeInSeconds % 60);
        return `${m}:${s < 10 ? "0" + s : s}`;
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        setCurrentTime(formatTime(current));
        setProgress((current / dur) * 100);
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        setDuration(formatTime(videoRef.current.duration));
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const toggleMute = () => {
        if (!videoRef.current) return;
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => console.error(err));
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(Math.min(x / rect.width, 1), 0);
        videoRef.current.currentTime = percent * videoRef.current.duration;
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        controlsTimeout.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 2500);
    };

    return (
        <div 
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            className="relative w-full max-w-6xl h-[85vh] bg-black/90 shadow-[0_20px_60px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden ring-1 ring-white/10 group flex items-center justify-center"
        >
            <video
                ref={videoRef}
                src={src}
                className="w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlay}
            />

            {/* Central Play Button Overlay (shows when paused) */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 p-4 rounded-full text-white backdrop-blur-sm pointer-events-auto cursor-pointer hover:bg-emerald-500/80 hover:scale-110 transition-all duration-300" onClick={togglePlay}>
                        <Play size={48} className="ml-2" />
                    </div>
                </div>
            )}

            {/* Controls Bar */}
            <div 
                className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 sm:p-6 transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}
            >
                {/* Progress Bar */}
                <div 
                    className="w-full h-1.5 sm:h-2 bg-white/20 rounded-full mb-4 cursor-pointer relative group/progress"
                    onClick={handleProgressClick}
                >
                    <div 
                        className="h-full bg-emerald-500 rounded-full relative"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full scale-0 group-hover/progress:scale-100 transition-transform shadow-lg" />
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-4 sm:gap-6">
                        <button onClick={togglePlay} className="hover:text-emerald-400 transition-colors">
                            {isPlaying ? <Pause size={24} fill="currentColor"/> : <Play size={24} fill="currentColor"/>}
                        </button>
                        
                        <div className="flex items-center gap-2">
                            <button onClick={toggleMute} className="hover:text-emerald-400 transition-colors">
                                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                        </div>

                        <div className="text-xs sm:text-sm font-medium tracking-wide text-gray-300">
                            {currentTime} / {duration}
                        </div>
                    </div>

                    <div className="flex items-center">
                        <button onClick={toggleFullscreen} className="hover:text-emerald-400 transition-colors">
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
