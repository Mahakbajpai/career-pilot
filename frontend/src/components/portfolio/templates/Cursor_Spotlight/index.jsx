import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import data from '../../../../data/dummy_data.json';

import { AmbientBackground, SpotlightOverlay } from './Background';
import Hero from './Hero';
import Skills from './Skills';
import Projects from './Projects';
import Experience from './Experience';
import Testimonials from './Testimonials';
import Contact from './Contact';

export default function CursorSpotlightPortfolio() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Center spotlight statically on mobile devices
    if (window.matchMedia("(pointer: coarse)").matches) {
      setIsTouchDevice(true);
      setMousePosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      return;
    }

    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen bg-zinc-950 font-sans text-zinc-50 selection:bg-blue-500/30 overflow-x-hidden cursor-none">
      
      <AmbientBackground />
      {!isTouchDevice && <SpotlightOverlay mousePosition={mousePosition} />}

      {!isTouchDevice && (
        <motion.div
          className="pointer-events-none fixed top-0 left-0 z-[60] h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_10px_#60a5fa]"
          animate={{ x: mousePosition.x - 4, y: mousePosition.y - 4 }}
          transition={{ type: "spring", stiffness: 1000, damping: 28, mass: 0.1 }}
        />
      )}

      <main className="relative z-10 pb-24">
        <Hero personal={data.personal} socials={data.socials} />
        <Skills skills={data.skills} />
        <Projects projects={data.projects} />
        <Experience experience={data.experience} />
        <Testimonials testimonials={data.testimonials} />
        <Contact personal={data.personal} socials={data.socials} />

        <footer className="mt-24 border-t border-zinc-900 py-8 text-center text-sm text-zinc-600">
          <p>Exploring the unknown. Crafted with Motion & Light.</p>
        </footer>
      </main>
    </div>
  );
}