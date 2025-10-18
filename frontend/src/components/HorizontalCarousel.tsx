import { useEffect, useState } from 'react';

interface HorizontalCarouselProps {
  images: string[];
  speed?: number;
}

const HorizontalCarousel = ({ images, speed = 30 }: HorizontalCarouselProps) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % (images.length * 512));
    }, speed);

    return () => clearInterval(interval);
  }, [images.length, speed]);

  // Duplicate images for seamless loop
  const duplicatedImages = [...images, ...images, ...images];

  return (
    <div className="w-full overflow-hidden relative h-full">
      <div
        className="flex transition-transform duration-75 ease-linear"
        style={{
          transform: `translateX(-${offset}px)`,
        }}
      >
        {duplicatedImages.map((image, index) => (
          <div key={index} className="mr-4 flex-shrink-0">
            <img
              src={image}
              alt={`Carousel ${index}`}
              className="w-[325px] h-[325px] object-cover rounded-lg"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default HorizontalCarousel;