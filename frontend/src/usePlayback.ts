import { useEffect, useRef, useState } from 'react';
import type { Frame } from './domain';

export function usePlayback(frames: Frame[], identity: string, autoplay=false) {
  const cursor = useRef(0); const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const duration = frames.length ? frames.at(-1)!.time-frames[0].time : 0;
  useEffect(() => { cursor.current = 0; setTime(0); setPlaying(autoplay&&!reduced&&duration>0); }, [identity,autoplay,reduced,duration]);
  useEffect(() => {
    if (!playing || !duration) return;
    let raf = 0, previous = performance.now(), lastUI = previous;
    const step = (now: number) => {
      cursor.current = (cursor.current + (now-previous)/1000*speed)%duration; previous = now;
      if (now-lastUI > 80) { setTime(cursor.current); lastUI = now; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);
  const seek = (t: number) => { cursor.current = Math.max(0,Math.min(duration,t)); setTime(cursor.current); };
  const toggle = () => { if (cursor.current >= duration) seek(0); setPlaying(p => !p); };
  return { cursor, time, playing, speed, duration, seek, toggle, setSpeed, pause: () => setPlaying(false) };
}
