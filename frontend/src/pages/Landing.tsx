import HorizontalCarousel from '@/components/HorizontalCarousel';
import { Button } from '@/components/ui/button';
import VerticalCarousel from '@/components/VerticalCarousel';
import { useNavigate } from 'react-router-dom';

// Predefined image paths for carousels
const leftImages = [
  "src/assets/1.jpg",
  "src/assets/2.jpg",
  "src/assets/3.jpg",
  "src/assets/4.jpg",
  "src/assets/5.jpg",
  "src/assets/6.jpg",
  "src/assets/7.jpg",
  "src/assets/8.jpg",
  "src/assets/9.jpg",
];

const topRightImages = [
  "src/assets/10.jpg",
  "src/assets/11.jpg",
  "src/assets/12.jpg",
  "src/assets/13.jpg",
  "src/assets/14.jpg",

];

const bottomRightImages = [
  "src/assets/15.jpg",
  "src/assets/16.jpg",
  "src/assets/17.jpg",
  "src/assets/18.jpg",
  "src/assets/8.jpg",
  "src/assets/9.jpg",

];

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-background flex items-center overflow-hidden relative">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px]" />
      </div>

      <div className="container mx-auto px-8 py-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-6xl font-bold leading-tight">
                Create Stunning{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                  AI-Powered Reels
                </span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-md">
                Transform your stories into captivating video reels with AI-generated scenes, images, and narration.
              </p>
            </div>

            <Button
              size="lg"
              className="text-lg px-8"
              onClick={() => navigate('/generator')}
            >
              Get Started
            </Button>
          </div>

          {/* Right Carousels */}
          <div className="grid grid-cols-2 gap-4 h-[700px]">
            {/* Left Column - Single tall carousel */}
            <div className="h-full">
              <VerticalCarousel images={leftImages} speed={25} height="h-full" />
            </div>

            {/* Right Column - Two stacked carousels */}
            <div className="flex flex-col h-full  ">
              <div className="flex-[1] mt-4">
                <HorizontalCarousel images={topRightImages} speed={30} />
              </div>
              <div className="flex-[1]">
                <HorizontalCarousel images={bottomRightImages} speed={60} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
