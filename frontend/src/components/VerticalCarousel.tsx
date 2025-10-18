import { useEffect, useState } from 'react';

interface VerticalCarouselProps {
  images: string[];
  speed?: number;
  height?: string;
}

const VerticalCarousel = ({ images, speed = 30, height = 'h-full' }: VerticalCarouselProps) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % (images.length * 400));
    }, speed);

    return () => clearInterval(interval);
  }, [images.length, speed]);

  // Duplicate images for seamless loop
  const duplicatedImages = [...images, ...images, ...images];

  return (
    <div className={`${height} overflow-hidden relative`}>
      <div
        className="absolute w-full transition-transform duration-75 ease-linear"
        style={{
          transform: `translateY(-${offset}px)`,
        }}
      >
        {duplicatedImages.map((image, index) => (
          <div key={index} className="mb-4">
            <img
              src={image}
              alt={`Carousel ${index}`}
              className="w-full aspect-square object-cover rounded-lg"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default VerticalCarousel;
