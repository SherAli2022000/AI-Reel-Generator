import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Wand2, Sparkles, Play, Image as ImageIcon, Lock, RotateCcw, CheckCircle2, RefreshCw, Volume2, Pause } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AudioPlayer from './AudioPlayer';

interface Scene {
  id: string;
  narration: string;
  imagePrompt: string;
  images?: string[];
  selectedImages?: number[];
  audioUrl?: string;
}

type Step = 'input' | 'story' | 'scenes' | 'images' | 'finalize';

const ReelGenerator = () => {
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [storyMode, setStoryMode] = useState<'new' | 'continue'>('new');
  const [generatedStory, setGeneratedStory] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [finalReelUrl, setFinalReelUrl] = useState('');
  const [isPlayingReel, setIsPlayingReel] = useState(false);
  const [outputFolder, setOutputFolder] = useState('');
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Backend API URL - update this to your Flask server URL
  const API_BASE_URL = 'http://localhost:5000';
  const [currentDate, setCurrentDate] = useState('');

  const storyRef = useRef<HTMLDivElement>(null);
  const scenesRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);
  const finalizeRef = useRef<HTMLDivElement>(null);

  // Timer-based progress increment
  useEffect(() => {
    if (isLoading && activeOperation) {
      // Clear any existing interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // Start at 5%
      setProgress(5);

      // Add 4% every 15 seconds
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 4;
          // Cap at 95% to avoid reaching 100% before completion
          return newProgress >= 95 ? 95 : newProgress;
        });
      }, 15000);

      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval when loading stops
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (!isLoading) {
        setProgress(0);
        setActiveOperation(null);
      }
    }
  }, [isLoading, activeOperation]);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const stepProgress = {
    'input': 20,
    'story': 40,
    'scenes': 60,
    'images': 80,
    'finalize': 100
  };

  const generateStory = async () => {
    setIsLoading(true);
    setActiveOperation('story');

    try {
      const response = await fetch(`${API_BASE_URL}/generate-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: storyMode, text: storyPrompt })
      });

      if (!response.ok) throw new Error('Failed to generate story');

      const data = await response.json();
      setGeneratedStory(data.story);
      setProgress(100);
      setCurrentStep('story');

      setTimeout(() => {
        setProgress(0);
        setActiveOperation(null);
      }, 500);

      toast({
        title: "Story Generated!",
        description: "Your AI story is ready for review.",
      });

      setTimeout(() => scrollToSection(storyRef), 100);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate story. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateScenes = async () => {
    setIsLoading(true);
    setActiveOperation('scenes');

    try {
      const response = await fetch(`${API_BASE_URL}/generate-scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: generatedStory })
      });

      if (!response.ok) throw new Error('Failed to generate scenes');

      const data = await response.json();
      const generatedScenes: Scene[] = data.scenes.map((scene: any, idx: number) => ({
        id: String(idx + 1),
        narration: scene.narration,
        imagePrompt: scene.prompt
      }));

      setScenes(generatedScenes);
      setProgress(100);
      setCurrentStep('scenes');

      setTimeout(() => {
        setProgress(0);
        setActiveOperation(null);
      }, 500);

      toast({
        title: "Scenes Generated!",
        description: `Created ${data.scene_count} scenes from your story.`,
      });

      setTimeout(() => scrollToSection(scenesRef), 100);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate scenes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addScene = () => {
    const newScene = {
      id: Date.now().toString(),
      narration: '',
      imagePrompt: ''
    };
    setScenes([...scenes, newScene]);
  };

  const deleteScene = (id: string) => {
    setScenes(scenes.filter(scene => scene.id !== id));
  };

  const updateSceneNarration = (id: string, narration: string) => {
    setScenes(scenes.map(scene =>
      scene.id === id ? { ...scene, narration } : scene
    ));
  };

  const updateSceneImagePrompt = (id: string, imagePrompt: string) => {
    setScenes(scenes.map(scene =>
      scene.id === id ? { ...scene, imagePrompt } : scene
    ));
  };

  const generateImages = async () => {
    setIsLoading(true);
    setActiveOperation('images');
    setProgress(5); // Start with initial progress

    try {
      // Step 1: Generate images
      const totalSteps = scenes.length * 2; // Each scene needs images and audio
      let completedSteps = 0;

      const scenesPayload = scenes.map(scene => ({
        narration: scene.narration,
        prompt: scene.imagePrompt
      }));

      setProgress(10); // Update progress before starting image generation

      const imagesResponse = await fetch(`${API_BASE_URL}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: scenesPayload })
      });

      if (!imagesResponse.ok) throw new Error('Failed to generate images');

      const imagesData = await imagesResponse.json();
      console.log('Images response:', imagesData); // Debug log
      setOutputFolder(imagesData.output_folder);

      completedSteps += scenes.length;
      setProgress(50); // Images completed, halfway through

      // Step 2: Generate audio
      const audioResponse = await fetch(`${API_BASE_URL}/generate-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: imagesData.scenes,
          output_folder: imagesData.output_folder
        })
      });

      if (!audioResponse.ok) throw new Error('Failed to generate audio');

      const audioData = await audioResponse.json();
      completedSteps += scenes.length;
      setProgress(95); // Almost done

      // Update scenes with generated data
      const updatedScenes = scenes.map((scene, idx) => {
        const imagePaths = imagesData.scenes[idx]?.image_paths || [];
        console.log(`Scene ${idx + 1} original image paths:`, imagePaths); // Debug log

        const processedPaths = imagePaths.map(path => {
          // Extract everything after 'generater/'
          const match = path.match(/ReelGenerater[\\/](.*)$/);
          if (match) {
            return match[1]; // everything after "generater/"
          }
          // If no match, use the path as is
          return path;
        });

        console.log(`Scene ${idx + 1} processed image paths:`, processedPaths); // Debug log

        return {
          ...scene,
          images: processedPaths,
          selectedImages: [],
          audioUrl: audioData.audio_paths[idx] || ''
        };
      });

      console.log('Final updated scenes:', updatedScenes); // Debug log
      setScenes(updatedScenes);

      setTimeout(() => {
        setProgress(100);
        // Only move to next step after everything is complete
        setCurrentStep('images');
        setTimeout(() => {
          setProgress(0);
          setActiveOperation(null);
        }, 500);
      }, 500);

      toast({
        title: "Content Generated!",
        description: "Images and audio created successfully.",
      });

      setTimeout(() => scrollToSection(imagesRef), 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate content. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleImageSelection = (sceneId: string, imageIndex: number) => {
    setScenes(scenes.map(scene => {
      if (scene.id === sceneId) {
        const selectedImages = scene.selectedImages || [];
        const isSelected = selectedImages.includes(imageIndex);

        return {
          ...scene,
          selectedImages: isSelected
            ? selectedImages.filter(i => i !== imageIndex)
            : [...selectedImages, imageIndex]
        };
      }
      return scene;
    }));
  };

  const regenerateImages = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setIsLoading(true);
    setActiveOperation(`regenerate-images-${sceneId}`);

    toast({
      title: "Regenerating Images",
      description: "Generating 4 additional images...",
    });

    try {
      const response = await fetch(`${API_BASE_URL}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [{ narration: scene.narration, prompt: scene.imagePrompt }]
        })
      });

      if (!response.ok) throw new Error('Failed to regenerate images');

      const data = await response.json();
      const newImages = data.scenes[0]?.image_paths || [];

      setScenes(scenes.map(s => {
        if (s.id === sceneId) {
          return {
            ...s,
            images: [...(s.images || []), ...newImages]
          };
        }
        return s;
      }));

      setProgress(100);
      setTimeout(() => {
        setProgress(0);
        setActiveOperation(null);
      }, 500);

      toast({
        title: "Images Added!",
        description: "4 new images have been generated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to regenerate images.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateAudio = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setIsLoading(true);
    setActiveOperation(`regenerate-audio-${sceneId}`);

    toast({
      title: "Regenerating Audio",
      description: "Creating new audio for this scene...",
    });

    try {
      const response = await fetch(`${API_BASE_URL}/generate-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [{ narration: scene.narration }],
          output_folder: outputFolder
        })
      });

      if (!response.ok) throw new Error('Failed to regenerate audio');

      const data = await response.json();
      const newAudioUrl = data.audio_paths[0];

      setScenes(scenes.map(s => {
        if (s.id === sceneId) {
          return {
            ...s,
            audioUrl: newAudioUrl
          };
        }
        return s;
      }));

      setProgress(100);
      setTimeout(() => {
        setProgress(0);
        setActiveOperation(null);
      }, 500);

      toast({
        title: "Audio Regenerated!",
        description: "New audio has been created for this scene.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to regenerate audio.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetToInput = () => {
    setCurrentStep('input');
    setStoryPrompt('');
    setGeneratedStory('');
    setScenes([]);
    setProgress(0);
  };

  const resetFromStep = (step: Step) => {
    setCurrentStep(step);

    if (step === 'input') {
      setGeneratedStory('');
      setScenes([]);
    } else if (step === 'story') {
      setScenes([]);
    }

    toast({
      title: "Progress Reset",
      description: `Returning to ${step} step. All subsequent steps have been cleared.`,
    });
  };

  const getStepStatus = (step: Step): 'locked' | 'active' | 'upcoming' => {
    const stepOrder: Step[] = ['input', 'story', 'scenes', 'images', 'finalize'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);

    if (stepIndex < currentIndex) return 'locked';
    if (stepIndex === currentIndex) return 'active';
    return 'upcoming';
  };

  const proceedToFinalize = () => {
    setCurrentStep('finalize');
    toast({
      title: "Ready to Finalize!",
      description: "Generate your final reel.",
    });
    setTimeout(() => scrollToSection(finalizeRef), 100);
  };

  const generateFinalReel = async () => {
    setIsLoading(true);
    setActiveOperation('finalize');

    try {
      // Step 1: Prepare the folder with selected images and audio
      const preparePayload = scenes.map((scene, idx) => ({
        scene_index: idx + 1,
        narration: scene.narration,
        prompt: scene.imagePrompt,
        selected_image_indices: scene.selectedImages || [],
        all_images: scene.images || [],
        audio_url: scene.audioUrl || ''
      }));

      const prepareResponse = await fetch(`${API_BASE_URL}/prepare-video-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: preparePayload,
          source_folder: outputFolder
        })
      });

      if (!prepareResponse.ok) throw new Error('Failed to prepare video folder');

      const prepareData = await prepareResponse.json();
      const finalFolder = prepareData.output_folder;

      setProgress(50);

      // Step 2: Create video from the prepared folder
      const scenesPayload = scenes.map((scene, idx) => ({
        scene_index: idx + 1,
        narration: scene.narration,
        prompt: scene.imagePrompt
      }));

      const response = await fetch(`${API_BASE_URL}/create-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          output_folder: finalFolder,
          scenes: scenesPayload,
          output_filename: 'final_story.mp4'
        })
      });

      if (!response.ok) throw new Error('Failed to create video');

      const data = await response.json();
      setProgress(100);

      // In production, you'd need to serve this file or upload it somewhere accessible
      setFinalReelUrl(data.video_path);

      setTimeout(() => {
        setProgress(0);
        setActiveOperation(null);
      }, 500);

      toast({
        title: "Reel Generated!",
        description: "Your AI-generated reel is ready.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create video. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleReelPlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlayingReel) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlayingReel(!isPlayingReel);
  };

  const downloadReel = async (finalReelUrl: string) => {
    if (!finalReelUrl) {
      toast({
        title: "No Video Found",
        description: "Please generate a reel before downloading.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Show a loading toast
      toast({
        title: "Downloading...",
        description: "Please wait while your reel is being prepared.",
      });

      console.log('Downloading video from URL:', finalReelUrl); // Debug log

      // Fetch the video as a blob from your Flask backend
      const response = await fetch(`${API_BASE_URL}/get-video/${finalReelUrl}`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch video from server");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link element to trigger the download
      const link = document.createElement("a");
      link.href = url;
      link.download = "ai-generated-reel.mp4";
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: "Your reel is being downloaded.",
      });
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        title: "Download Failed",
        description: "Something went wrong while downloading the reel.",
        variant: "destructive",
      });
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 relative">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-secondary/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-40 left-1/4 w-60 h-60 bg-accent/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Header */}
      <div className="border-b border-border/50 bg-card/30 backdrop-blur-xl sticky top-0 z-50 relative">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center shadow-glow">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">
                    AI Reel Generator
                  </h1>
                  <p className="text-xs text-muted-foreground">Transform stories into visual masterpieces</p>
                </div>
              </div>

              {/* Step Indicator - Inline */}
              <div className="flex items-center gap-2 ml-8">
                {(['input', 'story', 'scenes', 'images', 'finalize'] as Step[]).map((step, index) => {
                  const status = getStepStatus(step);
                  const isLast = index === 4;

                  return (
                    <React.Fragment key={step}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${status === 'active'
                          ? 'bg-gradient-primary shadow-glow'
                          : status === 'locked'
                            ? 'bg-primary/20 border border-primary'
                            : 'bg-secondary border border-border'
                        }`}>
                        {status === 'locked' ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : (
                          <span className={`text-xs font-bold ${status === 'active' ? 'text-white' : 'text-muted-foreground'
                            }`}>
                            {index + 1}
                          </span>
                        )}
                      </div>

                      {!isLast && (
                        <div className={`w-8 h-0.5 transition-all duration-300 ${status === 'locked' ? 'bg-primary' : 'bg-border'
                          }`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <Progress
              value={stepProgress[currentStep]}
              className="w-32 h-2"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-7xl relative z-10">
        {/* Step 1: Input - Info Left, Process Right */}
        <div className="grid lg:grid-cols-2 gap-8 items-center min-h-[70vh] mb-20 relative">
          {/* Lock Overlay */}
          {getStepStatus('input') === 'locked' && (
            <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-md rounded-xl flex items-center justify-center animate-fade-in">
              <Card className="max-w-md bg-card/95 border-primary/30 shadow-glow">
                <CardContent className="pt-6 text-center space-y-4">
                  <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Lock className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Step Locked</h3>
                    <p className="text-muted-foreground text-sm">
                      This step is completed. Click below to return and edit this step.
                      <span className="block mt-2 text-destructive font-medium">
                        Warning: All following steps will be removed.
                      </span>
                    </p>
                  </div>
                  <Button
                    onClick={() => resetFromStep('input')}
                    className="bg-gradient-primary hover:shadow-glow"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Return & Remove Following Steps
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Left: Info */}
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-4">
              <Badge variant="outline" className="text-sm px-3 py-1">Step 1 of 5</Badge>
              <h2 className="text-4xl font-bold leading-tight">
                Start Your Creative
                <span className="block bg-gradient-hero bg-clip-text text-transparent">Journey</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Whether you're starting fresh or continuing an existing narrative, our AI will transform your ideas into compelling visual stories.
              </p>
            </div>

            <div className="space-y-4 pt-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Wand2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">AI-Powered Generation</h3>
                  <p className="text-sm text-muted-foreground">Advanced AI creates engaging stories from your prompts</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Full Creative Control</h3>
                  <p className="text-sm text-muted-foreground">Edit and refine every aspect before generation</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Process */}
          <div className="animate-enter">
            <Card className="bg-glass border-glass backdrop-blur-sm shadow-card">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl mb-2">Create Your AI Reel</CardTitle>
                <p className="text-muted-foreground">
                  Tell us what story you want to create, and we'll generate an amazing reel for you.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex space-x-4">
                    <Button
                      variant={storyMode === 'new' ? 'default' : 'outline'}
                      onClick={() => setStoryMode('new')}
                      className="flex-1"
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      Create New Story
                    </Button>
                    <Button
                      variant={storyMode === 'continue' ? 'default' : 'outline'}
                      onClick={() => setStoryMode('continue')}
                      className="flex-1"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Continue Story
                    </Button>
                  </div>

                  <Textarea
                    placeholder={storyMode === 'new'
                      ? "Describe the theme or concept for your story (e.g., 'A cyberpunk adventure about a hacker saving the world')"
                      : "Paste your existing story here and we'll continue it..."
                    }
                    value={storyPrompt}
                    onChange={(e) => setStoryPrompt(e.target.value)}
                    className="min-h-[200px] bg-secondary/50 border-glass resize-none"
                    style={{ height: 'auto' }}
                  />
                </div>

                <Button
                  onClick={generateStory}
                  disabled={!storyPrompt.trim() || isLoading}
                  className="w-full bg-gradient-primary hover:shadow-glow transition-all duration-300 hover-scale"
                  size="lg"
                >
                  {isLoading && activeOperation === 'story' ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Generating Story...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Story
                    </>
                  )}
                </Button>

                {isLoading && activeOperation === 'story' && progress > 0 && (
                  <div className="space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">AI is crafting your story...</p>
                      <p className="text-sm font-medium">{progress}%</p>
                    </div>
                    <Progress value={progress} className="w-full h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Step 2: Story - Process Left, Info Right */}
        {(currentStep === 'story' || currentStep === 'scenes' || currentStep === 'images') && (
          <div className="grid lg:grid-cols-2 gap-8 items-center min-h-[70vh] mb-20 relative">
            {/* Lock Overlay */}
            {getStepStatus('story') === 'locked' && (
              <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-md rounded-xl flex items-center justify-center animate-fade-in">
                <Card className="max-w-md bg-card/95 border-primary/30 shadow-glow">
                  <CardContent className="pt-6 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                      <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">Step Locked</h3>
                      <p className="text-muted-foreground text-sm">
                        This step is completed. Click below to return and edit this step.
                        <span className="block mt-2 text-destructive font-medium">
                          Warning: All following steps will be removed.
                        </span>
                      </p>
                    </div>
                    <Button
                      onClick={() => resetFromStep('story')}
                      className="bg-gradient-primary hover:shadow-glow"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Return & Remove Following Steps
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Left: Process */}
            <div ref={storyRef} className="animate-enter order-2 lg:order-1">
              <Card className="bg-glass border-glass backdrop-blur-sm shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Wand2 className="w-5 h-5 mr-2 text-primary" />
                    Generated Story
                  </CardTitle>
                  <p className="text-muted-foreground">
                    Review and edit your story before generating scenes.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Textarea
                    value={generatedStory}
                    onChange={(e) => setGeneratedStory(e.target.value)}
                    className="min-h-[300px] bg-secondary/50 border-glass resize-none"
                    style={{ height: 'auto' }}
                  />

                  <div className="flex space-x-4">
                    <Button
                      variant="outline"
                      onClick={resetToInput}
                      className="flex-1 hover-scale"
                    >
                      Start Over
                    </Button>
                    <Button
                      onClick={generateScenes}
                      disabled={isLoading}
                      className="flex-1 bg-gradient-primary hover:shadow-glow transition-all duration-300 hover-scale"
                    >
                      {isLoading && activeOperation === 'scenes' ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Generate Scenes
                        </>
                      )}
                    </Button>
                  </div>

                  {isLoading && activeOperation === 'scenes' && progress > 0 && (
                    <div className="space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Breaking down your story into scenes...</p>
                        <p className="text-sm font-medium">{progress}%</p>
                      </div>
                      <Progress value={progress} className="w-full h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Info */}
            <div className="space-y-6 animate-fade-in order-1 lg:order-2">
              <div className="space-y-4">
                <Badge variant="outline" className="text-sm px-3 py-1">Step 2 of 5</Badge>
                <h2 className="text-4xl font-bold leading-tight">
                  Refine Your
                  <span className="block bg-gradient-hero bg-clip-text text-transparent">Narrative</span>
                </h2>
                <p className="text-lg text-muted-foreground">
                  Review the AI-generated story and make any adjustments. Your story is the foundation for creating stunning visual scenes.
                </p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Play className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Editable Content</h3>
                    <p className="text-sm text-muted-foreground">Modify the story to match your vision perfectly</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <ImageIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Scene Breakdown</h3>
                    <p className="text-sm text-muted-foreground">AI will analyze and create visual scenes from your story</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Scenes - Single Column */}
        {(currentStep === 'scenes' || currentStep === 'images') && (
          <div className="max-w-4xl mx-auto min-h-[70vh] mb-20 relative">
            {/* Lock Overlay */}
            {getStepStatus('scenes') === 'locked' && (
              <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-md rounded-xl flex items-center justify-center animate-fade-in">
                <Card className="max-w-md bg-card/95 border-primary/30 shadow-glow">
                  <CardContent className="pt-6 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                      <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">Step Locked</h3>
                      <p className="text-muted-foreground text-sm">
                        This step is completed. Click below to return and edit this step.
                        <span className="block mt-2 text-destructive font-medium">
                          Warning: All following steps will be removed.
                        </span>
                      </p>
                    </div>
                    <Button
                      onClick={() => resetFromStep('scenes')}
                      className="bg-gradient-primary hover:shadow-glow"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Return & Remove Following Steps
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Header Info */}
            <div className="text-center space-y-4 mb-8 animate-fade-in">
              <Badge variant="outline" className="text-sm px-3 py-1">Step 3 of 5</Badge>
              <h2 className="text-4xl font-bold leading-tight">
                Configure Your
                <span className="block bg-gradient-hero bg-clip-text text-transparent">Scenes</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Fine-tune each scene with narration and image prompts. Create the perfect blueprint for your visual story.
              </p>
            </div>

            {/* Scene Configuration */}
            <div ref={scenesRef} className="animate-enter">
              <Card className="bg-glass border-glass backdrop-blur-sm shadow-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center">
                        <ImageIcon className="w-5 h-5 mr-2 text-primary" />
                        Scene Configuration
                      </CardTitle>
                      <p className="text-muted-foreground">
                        Configure narration and image prompts for each scene.
                      </p>
                    </div>
                    <Button onClick={addScene} variant="outline" size="sm" className="hover-scale">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Scene
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {scenes.map((scene, index) => (
                    <div key={scene.id} className="group relative bg-secondary/20 border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 animate-fade-in">
                      <div className="flex items-start justify-between mb-3">
                        <Badge variant="default" className="bg-gradient-primary">
                          Scene {index + 1}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteScene(scene.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center">
                            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                            Narration / Voiceover
                          </label>
                          <Textarea
                            value={scene.narration}
                            onChange={(e) => updateSceneNarration(scene.id, e.target.value)}
                            placeholder="What will be said or narrated during this scene..."
                            className="bg-background/50 border-glass min-h-[80px] focus:border-primary/50 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center">
                            <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                            Image Generation Prompt
                          </label>
                          <Textarea
                            value={scene.imagePrompt}
                            onChange={(e) => updateSceneImagePrompt(scene.id, e.target.value)}
                            placeholder="Detailed description for AI image generation..."
                            className="bg-background/50 border-glass min-h-[80px] focus:border-primary/50 transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex space-x-4 pt-4 border-t border-border/50 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep('story')}
                      className="flex-1 hover-scale"
                    >
                      Back to Story
                    </Button>
                    <Button
                      onClick={generateImages}
                      disabled={scenes.length === 0 || isLoading}
                      className="flex-1 bg-gradient-primary hover:shadow-glow transition-all duration-300"
                    >
                      {isLoading && activeOperation === 'images' ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Images and Audios
                        </>
                      )}
                    </Button>
                  </div>

                  {isLoading && activeOperation === 'images' && progress > 0 && (
                    <div className="space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Generating images and audio...</p>
                        <p className="text-sm font-medium">{progress}%</p>
                      </div>
                      <Progress value={progress} className="w-full h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 4: Images - Single Column */}
        {currentStep === 'images' && (
          <div className="max-w-6xl mx-auto min-h-[70vh]">
            {/* Header Info */}
            <div className="text-center space-y-4 mb-8 animate-fade-in">
              <Badge variant="outline" className="text-sm px-3 py-1">Step 4 of 5</Badge>
              <h2 className="text-4xl font-bold leading-tight">
                Review and Select
                <span className="block bg-gradient-hero bg-clip-text text-transparent">Your Visuals</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Edit narration and image prompts, regenerate content, and select your favorite images.
              </p>
            </div>

            <div ref={imagesRef} className="space-y-6 animate-enter">

              {scenes.map((scene, sceneIndex) => (
                <Card key={scene.id} className="bg-glass border-glass backdrop-blur-sm shadow-card animate-fade-in hover:shadow-glow transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="default" className="bg-gradient-primary">Scene {sceneIndex + 1}</Badge>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerateAudio(scene.id)}
                          disabled={isLoading}
                          className="hover-scale"
                        >
                          {isLoading && activeOperation === `regenerate-audio-${scene.id}` ? (
                            <>
                              <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full mr-1.5" />
                              Regenerating...
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5 mr-1.5" />
                              Regenerate Audio
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerateImages(scene.id)}
                          disabled={isLoading}
                          className="hover-scale"
                        >
                          {isLoading && activeOperation === `regenerate-images-${scene.id}` ? (
                            <>
                              <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full mr-1.5" />
                              Regenerating...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                              Regenerate Images
                            </>
                          )}
                        </Button>
                        <Badge variant="outline" className="border-primary/50">
                          {scene.selectedImages?.length || 0} selected
                        </Badge>
                      </div>
                    </div>

                    {/* Progress bar for regenerate operations */}
                    {isLoading && (activeOperation === `regenerate-images-${scene.id}` || activeOperation === `regenerate-audio-${scene.id}`) && progress > 0 && (
                      <div className="space-y-2 mb-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">
                            {activeOperation === `regenerate-images-${scene.id}` ? 'Generating images...' : 'Generating audio...'}
                          </p>
                          <p className="text-sm font-medium">{progress}%</p>
                        </div>
                        <Progress value={progress} className="w-full h-2" />
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center">
                          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                          Narration / Voiceover
                        </label>
                        <Textarea
                          value={scene.narration}
                          onChange={(e) => updateSceneNarration(scene.id, e.target.value)}
                          placeholder="Edit narration..."
                          className="bg-background/50 border-glass min-h-[120px] focus:border-primary/50 transition-colors resize-none"
                          style={{ height: 'auto' }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center">
                          <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                          Image Generation Prompt
                        </label>
                        <Textarea
                          value={scene.imagePrompt}
                          onChange={(e) => updateSceneImagePrompt(scene.id, e.target.value)}
                          placeholder="Edit image prompt..."
                          className="bg-background/50 border-glass min-h-[120px] focus:border-primary/50 transition-colors resize-none"
                          style={{ height: 'auto' }} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Audio Player */}


                    {/* Images Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-2">
                      {scene.images?.map((image, imageIndex) => (
                        <div
                          key={imageIndex}
                          className={`relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 aspect-square group ${scene.selectedImages?.includes(imageIndex)
                              ? 'ring-2 ring-primary shadow-glow scale-[1.02]'
                              : 'hover:shadow-card hover:scale-[1.02]'
                            }`}
                          onClick={() => toggleImageSelection(scene.id, imageIndex)}
                        >
                          <img
                            src={`${API_BASE_URL}/get-image/${image}`}
                            alt={`Scene ${sceneIndex + 1} - Image ${imageIndex + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('Image failed to load:', `${API_BASE_URL}/${image}`);
                              // console.error('Full URL:', `${API_BASE_URL}/${outputFolder.split('\\').pop()}/${image}`);
                              e.currentTarget.src = '/placeholder.svg';
                            }}
                          />
                          {scene.selectedImages?.includes(imageIndex) && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {scene.audioUrl && (
                      <div className="mb-6">
                        <AudioPlayer audioUrl={`${API_BASE_URL}/get-audio/${scene.audioUrl}`} sceneIndex={sceneIndex} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              <div className="flex space-x-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep('scenes')}
                  className="flex-1 hover-scale"
                >
                  Back to Scenes
                </Button>
                <Button
                  onClick={proceedToFinalize}
                  className="flex-1 bg-gradient-primary hover:shadow-glow transition-all duration-300"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Finalize Reel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Finalize */}
        {currentStep === 'finalize' && (
          <div className="max-w-4xl mx-auto min-h-[70vh]">
            <div className="text-center space-y-4 mb-8 animate-fade-in">
              <Badge variant="outline" className="text-sm px-3 py-1">Step 5 of 5</Badge>
              <h2 className="text-4xl font-bold leading-tight">
                Finalize Your
                <span className="block bg-gradient-hero bg-clip-text text-transparent">AI Reel</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Generate your final reel from the selected scenes and images.
              </p>
            </div>

            <div ref={finalizeRef} className="space-y-6 animate-enter">
              {!finalReelUrl ? (
                <Card className="bg-glass border-glass backdrop-blur-sm shadow-card">
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl mb-2">Generate Final Reel</CardTitle>
                    <p className="text-muted-foreground">
                      Click below to compile all your scenes into a final video reel.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-secondary/20 border border-border/50 rounded-lg p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Scenes</span>
                        <Badge variant="default" className="bg-gradient-primary">{scenes.length}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Selected Images</span>
                        <Badge variant="default" className="bg-gradient-primary">
                          {scenes.reduce((acc, scene) => acc + (scene.selectedImages?.length || 0), 0)}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      onClick={generateFinalReel}
                      disabled={isLoading}
                      className="w-full bg-gradient-primary hover:shadow-glow transition-all duration-300"
                      size="lg"
                    >
                      {isLoading && activeOperation === 'finalize' ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Generating Reel...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Final Reel
                        </>
                      )}
                    </Button>

                    {isLoading && activeOperation === 'finalize' && progress > 0 && (
                      <div className="space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Compiling your reel...</p>
                          <p className="text-sm font-medium">{progress}%</p>
                        </div>
                        <Progress value={progress} className="w-full h-2" />
                      </div>
                    )}

                    <div className="flex space-x-4">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentStep('images')}
                        className="flex-1 hover-scale"
                      >
                        Back to Images
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-glass border-glass backdrop-blur-sm shadow-card">
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 mr-2 text-primary" />
                      Your Reel is Ready!
                    </CardTitle>
                    <p className="text-muted-foreground">
                      Preview your AI-generated reel and download it.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                      <video
                        ref={videoRef}
                        src={`${API_BASE_URL}/get-video/${finalReelUrl}`}
                        className="w-full h-full object-contain"
                        onPlay={() => setIsPlayingReel(true)}
                        onPause={() => setIsPlayingReel(false)}
                        onEnded={() => setIsPlayingReel(false)}
                      />

                      {!isPlayingReel && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Button
                            onClick={toggleReelPlayback}
                            size="lg"
                            className="w-16 h-16 rounded-full bg-gradient-primary hover:shadow-glow"
                          >
                            <Play className="w-8 h-8" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={toggleReelPlayback}
                        variant="outline"
                        className="flex-1 hover-scale"
                      >
                        {isPlayingReel ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Play
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => downloadReel(finalReelUrl)}
                        className="flex-1 bg-gradient-primary hover:shadow-glow transition-all duration-300"
                      >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Download Reel
                      </Button>

                    </div>


                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReelGenerator;