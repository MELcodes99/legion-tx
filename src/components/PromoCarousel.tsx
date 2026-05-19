import { useEffect, useState } from "react";
import promo1 from "@/assets/promo-1.jpeg";
import promo2 from "@/assets/promo-2.jpeg";
import promo3 from "@/assets/promo-3.jpeg";
import promo4 from "@/assets/promo-4.jpeg";

const IMAGES = [promo1, promo2, promo3, promo4];
const INTERVAL = 5000;

export const PromoCarousel = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % IMAGES.length);
    }, INTERVAL);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass-card relative overflow-hidden aspect-[4/3] sm:aspect-[16/10]">
        {IMAGES.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Legion highlight ${i + 1}`}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-in-out"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {IMAGES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === index ? "w-6 bg-white/80" : "w-1.5 bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
