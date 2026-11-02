"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

type SlideItem = {
  image: string;
  alt: string;
  title: string;
};

const SLIDER_DATA: SlideItem[] = [
  {
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/20.webp",
    alt: "oversized vintage streetwear outfit UK",
    title: "Oversized Vintage Streetwear Outfit UK",
  },
  {
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/21.webp",
    alt: "men streetwear fashion oversized hoodie",
    title: "Men Streetwear Fashion Oversized Hoodie",
  },
  {
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/22.webp",
    alt: "retro vintage clothing street style",
    title: "Retro Vintage Clothing Street Style",
  },
  {
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/23.webp",
    alt: "sustainable streetwear fashion UK",
    title: "Sustainable Streetwear Fashion UK",
  },
  {
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/24.webp",
    alt: "baggy streetwear outfit inspiration",
    title: "Baggy Streetwear Outfit Inspiration",
  },
  {
    image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/25.webp",
    alt: "modern men streetwear fashion look",
    title: "Modern Men Streetwear Fashion Look",
  },
];

function getPositionClass(index: number, current: number, total: number) {
  let diff = index - current;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;

  if (diff === 0) return "is-active";
  if (diff === -1) return "is-left-1";
  if (diff === -2) return "is-left-2";
  if (diff === -3) return "is-left-3";
  if (diff === 1) return "is-right-1";
  if (diff === 2) return "is-right-2";
  if (diff === 3) return "is-right-3";
  return "";
}

export function HeroSlider() {
  const total = SLIDER_DATA.length;
  const [current, setCurrent] = useState(0);
  const isAnimatingRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, isDragging: false });

  // Slow scroll-linked drift on the whole shell — subtle (24px over the
  // hero's own height), just enough to read as "parallax" rather than a
  // static image, without fighting each .sm-slide's own JS-driven
  // position/scale transform (that stays on a separate element).
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["0px", "-24px"]);

  const positions = useMemo(
    () => SLIDER_DATA.map((_, index) => getPositionClass(index, current, total)),
    [current, total]
  );

  function lockAnimation() {
    isAnimatingRef.current = true;
    setTimeout(() => {
      isAnimatingRef.current = false;
    }, 420);
  }

  function nextSlide() {
    if (isAnimatingRef.current) return;
    setCurrent((c) => (c + 1) % total);
    lockAnimation();
  }

  function prevSlide() {
    if (isAnimatingRef.current) return;
    setCurrent((c) => (c - 1 + total) % total);
    lockAnimation();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "ArrowRight") nextSlide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function handlePointerDown(x: number) {
    dragRef.current = { startX: x, isDragging: true };
  }

  function handlePointerUp(x: number) {
    const { startX, isDragging } = dragRef.current;
    if (!isDragging) return;
    dragRef.current.isDragging = false;
    const diff = x - startX;
    if (Math.abs(diff) > 40) {
      if (diff < 0) nextSlide();
      else prevSlide();
    }
  }

  return (
    <div className="sm-hero-slider" id="smHeroSlider" ref={sectionRef}>
      <motion.div
        className="sm-hero-inner"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.1, ease: EASE }}
      >
        <motion.div className="sm-slider-shell" style={{ y: parallaxY }}>
          <button className="sm-nav sm-nav-prev" aria-label="Previous" onClick={prevSlide}>
            <span>&larr;</span>
          </button>

          <div
            className="sm-stage"
            ref={stageRef}
            onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
            onTouchEnd={(e) => handlePointerUp(e.changedTouches[0].clientX)}
            onMouseDown={(e) => handlePointerDown(e.clientX)}
            onMouseUp={(e) => handlePointerUp(e.clientX)}
            onDragStart={(e) => e.preventDefault()}
          >
            {SLIDER_DATA.map((item, index) => (
              <div key={item.image} className={`sm-slide ${positions[index]}`}>
                {/* Idle float lives on this inner wrapper, not .sm-slide
                    itself — the outer element's transform is already fully
                    owned by the JS-driven position/scale transition above,
                    so a CSS keyframe on the same property would fight it. */}
                <div className="sm-slide-float" style={{ animationDelay: `${(index % total) * 0.35}s` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt={item.alt}
                    title={item.title}
                    loading="lazy"
                    decoding="async"
                    width={800}
                    height={1000}
                    draggable={false}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="sm-nav sm-nav-next" aria-label="Next" onClick={nextSlide}>
            <span>&rarr;</span>
          </button>
        </motion.div>

        <div className="sm-bottom-row">
          <div className="sm-brand">MrRework</div>
          <div className="sm-note">RECLAIMED VINTAGE, REBUILT WITH INTENT</div>
        </div>
      </motion.div>

      <style>{`
        .sm-hero-slider{
          width:100%;
          min-height:100vh;
          background:#fff;
          overflow:hidden;
          position:relative;
          font-family:"DM Sans", sans-serif;
        }

        .sm-hero-slider *{
          box-sizing:border-box;
        }

        .sm-hero-inner{
          position:relative;
          width:100%;
          min-height:100vh;
          padding:4px 24px 8px;
        }

        .sm-slider-shell{
          position:relative;
          width:100%;
          min-height:calc(100vh - 20px);
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .sm-stage{
          position:relative;
          width:100%;
          max-width:1500px;
          height:calc(100vh - 20px);
          margin:0 auto;
          touch-action:pan-y;
          user-select:none;
          overflow:hidden;
        }

        .sm-slide{
          position:absolute;
          top:50%;
          left:50%;
          width:240px;
          opacity:0;
          pointer-events:none;
          transform:translate(-50%,-50%) scale(.45);
          transform-origin:center center;
          will-change:transform, opacity, width;
          backface-visibility:hidden;
          -webkit-backface-visibility:hidden;
          transition:
            transform .42s cubic-bezier(.22,.61,.36,1),
            opacity .32s ease,
            width .42s cubic-bezier(.22,.61,.36,1),
            filter .32s ease;
        }

        .sm-slide img{
          width:100%;
          height:auto;
          max-height:78vh;
          object-fit:contain;
          display:block;
          margin:0 auto;
          -webkit-user-drag:none;
          user-select:none;
          filter:drop-shadow(0 10px 24px rgba(0,0,0,.05));
          transform:translateZ(0);
          backface-visibility:hidden;
          -webkit-backface-visibility:hidden;
        }

        /* Slow idle bob, staggered per slide via inline animation-delay —
           reads as "images floating in space" without ever touching the
           transform .sm-slide itself owns for position/scale. */
        .sm-slide-float{
          display:block;
          animation: smFloat 5s ease-in-out infinite;
        }

        @keyframes smFloat{
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        .sm-slide.is-active{
          width:470px;
          opacity:1;
          z-index:6;
          transform:translate(-50%,-50%) scale(1);
        }

        .sm-slide.is-left-1{
          width:270px;
          opacity:.95;
          z-index:4;
          transform:translate(calc(-50% - 360px), -50%) scale(.72);
        }

        .sm-slide.is-right-1{
          width:270px;
          opacity:.95;
          z-index:4;
          transform:translate(calc(-50% + 360px), -50%) scale(.72);
        }

        .sm-slide.is-left-2{
          width:220px;
          opacity:.72;
          z-index:3;
          transform:translate(calc(-50% - 560px), -50%) scale(.52);
        }

        .sm-slide.is-right-2{
          width:220px;
          opacity:.72;
          z-index:3;
          transform:translate(calc(-50% + 560px), -50%) scale(.52);
        }

        .sm-slide.is-left-3{
          width:170px;
          opacity:.45;
          z-index:2;
          transform:translate(calc(-50% - 710px), -50%) scale(.36);
        }

        .sm-slide.is-right-3{
          width:170px;
          opacity:.45;
          z-index:2;
          transform:translate(calc(-50% + 710px), -50%) scale(.36);
        }

        .sm-nav{
          position:absolute;
          top:50%;
          transform:translateY(-50%) scale(1);
          width:56px;
          height:56px;
          border:none;
          border-radius:999px;
          background:#f0efec;
          color:#111;
          cursor:pointer;
          z-index:20;
          display:flex;
          align-items:center;
          justify-content:center;
          transition:background-color .25s ease, box-shadow .25s ease, transform .25s ease;
          box-shadow:0 2px 6px rgba(17,17,17,.04);
          padding:0;
        }

        .sm-nav span{
          font-size:19px;
          line-height:1;
          font-weight:600;
          display:block;
          transform:translateY(-1px);
        }

        .sm-nav:hover{
          background:#fff;
          color:#111;
          box-shadow:0 10px 28px rgba(17,17,17,.14);
          transform:translateY(-50%) scale(1.05);
        }

        .sm-nav-prev{
          left:max(10px, calc(50% - 165px));
        }

        .sm-nav-next{
          right:max(10px, calc(50% - 165px));
        }

        .sm-bottom-row{
          position:absolute;
          left:24px;
          right:24px;
          bottom:8px;
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:20px;
          z-index:30;
        }

        .sm-brand{
          font-size:30px;
          line-height:1.2;
          font-weight:600;
          letter-spacing:.08em;
          color:#111;
        }

        .sm-note{
          font-size:20px;
          line-height:1.4;
          font-weight:500;
          color:#3d3d3d;
          text-align:right;
          letter-spacing:.02em;
        }

        @media (max-width: 1366px){
          .sm-slide.is-active{
            width:410px;
          }

          .sm-slide.is-left-1{
            transform:translate(calc(-50% - 300px), -50%) scale(.68);
          }

          .sm-slide.is-right-1{
            transform:translate(calc(-50% + 300px), -50%) scale(.68);
          }

          .sm-slide.is-left-2{
            transform:translate(calc(-50% - 470px), -50%) scale(.49);
          }

          .sm-slide.is-right-2{
            transform:translate(calc(-50% + 470px), -50%) scale(.49);
          }

          .sm-slide.is-left-3{
            transform:translate(calc(-50% - 610px), -50%) scale(.34);
          }

          .sm-slide.is-right-3{
            transform:translate(calc(-50% + 610px), -50%) scale(.34);
          }

          .sm-nav-prev{
            left:calc(50% - 140px);
          }

          .sm-nav-next{
            right:calc(50% - 140px);
          }
        }

        @media (max-width: 1024px){
          .sm-hero-inner{
            min-height:100vh;
            padding:2px 18px 8px;
          }

          .sm-slider-shell{
            min-height:calc(100vh - 18px);
          }

          .sm-stage{
            height:calc(100vh - 18px);
          }

          .sm-slide.is-active{
            width:350px;
          }

          .sm-slide.is-left-1{
            width:220px;
            transform:translate(calc(-50% - 220px), -50%) scale(.58);
          }

          .sm-slide.is-right-1{
            width:220px;
            transform:translate(calc(-50% + 220px), -50%) scale(.58);
          }

          .sm-slide.is-left-2{
            width:170px;
            transform:translate(calc(-50% - 360px), -50%) scale(.40);
          }

          .sm-slide.is-right-2{
            width:170px;
            transform:translate(calc(-50% + 360px), -50%) scale(.40);
          }

          .sm-slide.is-left-3,
          .sm-slide.is-right-3{
            opacity:0;
          }

          .sm-nav{
            width:36px;
            height:36px;
          }

          .sm-nav span{
            font-size:17px;
          }

          .sm-nav-prev{
            left:calc(50% - 112px);
          }

          .sm-nav-next{
            right:calc(50% - 112px);
          }
        }

        @media (max-width: 767px){
          .sm-hero-inner{
            min-height:65vh;
            padding:12px 12px 24px;
            display:flex;
            flex-direction:column;
            justify-content:flex-start;
            background:#fff;
          }

          .sm-slider-shell{
            min-height:calc(65vh - 36px);
            align-items:center;
          }

          .sm-stage{
            height:65vh;
            min-height:65vh;
            max-height:65vh;
          }

          .sm-slide{
            width:110px;
          }

          .sm-slide img{
            max-height:50vh;
          }

          .sm-slide.is-active{
            width:300px;
            transform:translate(-50%,-52%) scale(1.01);
          }

          .sm-slide.is-left-1{
            width:138px;
            opacity:.55;
            transform:translate(calc(-50% - 120px), -50%) scale(.5);
          }

          .sm-slide.is-right-1{
            width:138px;
            opacity:.55;
            transform:translate(calc(-50% + 120px), -50%) scale(.5);
          }

          .sm-slide.is-left-2,
          .sm-slide.is-right-2,
          .sm-slide.is-left-3,
          .sm-slide.is-right-3{
            opacity:0;
            transform:translate(-50%,-50%) scale(.2);
          }

          .sm-nav{
            top:auto;
            bottom:18px;
            transform:none;
            width:34px;
            height:34px;
            background:#f0efec;
          }

          .sm-nav:hover{
            transform:scale(1.05);
          }

          .sm-nav span{
            font-size:16px;
          }

          .sm-nav-prev{
            left:calc(50% - 44px);
          }

          .sm-nav-next{
            right:calc(50% - 44px);
          }

          .sm-bottom-row{
            left:12px;
            right:12px;
            bottom:4px;
            align-items:flex-end;
            gap:12px;
          }

          .sm-brand{
            font-size:12px;
            letter-spacing:.07em;
          }

          .sm-note{
            font-size:10px;
            line-height:1.2;
            max-width:100%;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            letter-spacing:.14em;
          }
        }

        @media (max-width: 480px){
          .sm-slide.is-active{
            width:270px;
          }

          .sm-slide.is-left-1{
            width:128px;
            transform:translate(calc(-50% - 110px), -50%) scale(.46);
          }

          .sm-slide.is-right-1{
            width:128px;
            transform:translate(calc(-50% + 110px), -50%) scale(.46);
          }
        }
      `}</style>
    </div>
  );
}
