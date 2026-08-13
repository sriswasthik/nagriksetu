"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Camera, MapPin, Mic, Loader2, ArrowRight } from "lucide-react";
import { complaintService } from "@/lib/services/complaints";
import { Progress } from "@/components/ui/progress";

const reportSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Please provide more details"),
  location: z.object({
    address: z.string().min(5, "Location is required"),
    latitude: z.number(),
    longitude: z.number(),
    ward: z.string().optional()
  }),
  media: z.array(z.string()).optional()
});

export default function ReportIssuePage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const form = useForm<z.infer<typeof reportSchema>>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      title: "",
      description: "",
      location: {
        address: "",
        latitude: 0,
        longitude: 0,
      }
    },
  });

  const handleCaptureLocation = () => {
    setIsCapturingLocation(true);
    // Simulate Geolocation API
    setTimeout(() => {
      form.setValue("location", {
        address: "123 Main St, Near Central Park, Ward 4",
        latitude: 12.9716,
        longitude: 77.5946,
        ward: "w-04"
      });
      setIsCapturingLocation(false);
    }, 1200);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In a real app, upload to storage and get URL. Here we use object URL for preview
      const objectUrl = URL.createObjectURL(file);
      setMediaPreview(objectUrl);
      form.setValue("media", [objectUrl]);
    }
  };

  async function onSubmit(values: z.infer<typeof reportSchema>) {
    setIsSubmitting(true);
    try {
      const complaint = await complaintService.createComplaint({
        title: values.title,
        description: values.description,
        location: values.location,
        category: "other" // Let AI assign this
      });
      
      // Navigate to the AI processing view
      router.push(`/citizen/complaints/${complaint.id}?process=ai`);
    } catch (error) {
      console.error("Failed to submit report", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader 
        title="Report an Issue" 
        description="Help us identify and fix problems in your area."
      />

      <div className="mb-8">
        <div className="flex items-center justify-between text-sm font-medium mb-2">
          <span className={step === 1 ? "text-primary" : "text-muted-foreground"}>Step 1: Evidence</span>
          <span className={step === 2 ? "text-primary" : "text-muted-foreground"}>Step 2: Details</span>
        </div>
        <Progress value={step === 1 ? 50 : 100} className="h-2" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          
          {/* STEP 1: MEDIA & LOCATION */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium">Upload Evidence</h3>
                      <p className="text-sm text-muted-foreground mb-4">Take a clear photo of the issue.</p>
                      
                      {!mediaPreview ? (
                        <div className="border-2 border-dashed rounded-lg p-12 text-center hover:bg-muted/50 transition-colors">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            id="photo-upload"
                            onChange={handlePhotoUpload}
                          />
                          <label htmlFor="photo-upload" className="cursor-pointer flex flex-col items-center">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                              <Camera className="h-6 w-6" />
                            </div>
                            <span className="font-medium">Tap to take a photo</span>
                            <span className="text-sm text-muted-foreground mt-1">or select from gallery</span>
                          </label>
                        </div>
                      ) : (
                        <div className="relative rounded-lg overflow-hidden border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaPreview} alt="Preview" className="w-full h-64 object-cover" />
                          <Button 
                            type="button" 
                            variant="secondary" 
                            size="sm" 
                            className="absolute top-2 right-2"
                            onClick={() => setMediaPreview(null)}
                          >
                            Change Photo
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <FormField
                    control={form.control}
                    name="location.address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="Enter address or tap to detect" {...field} />
                          </FormControl>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={handleCaptureLocation}
                            disabled={isCapturingLocation}
                          >
                            {isCapturingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4 text-primary" />}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Mock Map Placeholder */}
                  <div className="mt-4 h-48 bg-muted rounded-md border flex items-center justify-center relative overflow-hidden">
                    {form.watch("location.latitude") !== 0 ? (
                      <div className="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=12.9716,77.5946&zoom=15&size=600x300&markers=color:red%7C12.9716,77.5946&key=placeholder')] bg-cover bg-center opacity-50" />
                    ) : (
                      <span className="text-muted-foreground flex items-center">
                        <MapPin className="mr-2 h-4 w-4" /> Map Preview
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button 
                  type="button" 
                  onClick={() => {
                    const location = form.getValues("location.address");
                    if (location) setStep(2);
                    else form.trigger("location.address");
                  }}
                >
                  Continue to Details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: DETAILS */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brief Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Large pothole on Main Road" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Detailed Description</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Textarea 
                              placeholder="Describe the issue, landmarks nearby, and how long it has been there..." 
                              className="min-h-[120px]"
                              {...field} 
                            />
                          </FormControl>
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="icon" 
                            className="absolute bottom-2 right-2 text-primary"
                            title="Voice Input (Mock)"
                          >
                            <Mic className="h-5 w-5" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-primary/10 rounded-full shrink-0">
                      <Loader2 className="h-5 w-5 text-primary animate-spin-slow" />
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-1">AI Assisstant Active</h4>
                      <p className="text-sm text-muted-foreground">
                        Our AI will automatically categorize, prioritize, and route this issue to the correct department once submitted. You don&apos;t need to guess the category!
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting & Analyzing...
                    </>
                  ) : (
                    "Submit Report"
                  )}
                </Button>
              </div>
            </div>
          )}

        </form>
      </Form>
    </div>
  );
}
