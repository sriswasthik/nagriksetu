"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { useRouter } from "next/navigation";

import {
  useForm,
} from "react-hook-form";

import {
  zodResolver,
} from "@hookform/resolvers/zod";

import * as z from "zod";

import {
  PageHeader,
} from "@/components/shared/PageHeader";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import {
  Button,
} from "@/components/ui/button";

import {
  Input,
} from "@/components/ui/input";

import {
  Textarea,
} from "@/components/ui/textarea";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import {
  Progress,
} from "@/components/ui/progress";

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

import {
  Camera,
  ImagePlus,
  MapPin,
  Loader2,
  CheckCircle2,
  LocateFixed,
  ArrowRight,
  Mic,
  Navigation,
  X,
} from "lucide-react";

import {
  createComplaint,
  uploadComplaintEvidence,
} from "@/lib/services/complaints";


/*
 * ============================================================
 * VALIDATION
 * ============================================================
 */

const reportSchema = z.object({
  title: z
    .string()
    .min(
      5,
      "Title must be at least 5 characters"
    )
    .max(
      150,
      "Title cannot exceed 150 characters"
    ),

  description: z
    .string()
    .min(
      10,
      "Please provide more details about the issue"
    )
    .max(
      2000,
      "Description cannot exceed 2000 characters"
    ),

  location: z.object({
    address: z
      .string()
      .min(
        5,
        "Location/address is required"
      )
      .max(
        300,
        "Address cannot exceed 300 characters"
      ),

    latitude: z
      .number()
      .refine(
        (value) => value !== 0,
        {
          message:
            "Please capture your current location",
        }
      ),

    longitude: z
      .number()
      .refine(
        (value) => value !== 0,
        {
          message:
            "Please capture your current location",
        }
      ),

    ward: z
      .string()
      .optional(),
  }),

  media: z
    .array(z.string())
    .optional(),
});


type ReportFormValues =
  z.infer<typeof reportSchema>;


/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function ReportIssuePage() {

  const router =
    useRouter();


  /*
   * ==========================================================
   * FILE INPUT REF
   * ==========================================================
   *
   * IMPORTANT:
   *
   * We intentionally use a React ref instead of relying on
   * <label htmlFor="..."> to open the hidden input.
   *
   * This makes the upload button work consistently on:
   *
   * - Desktop browsers
   * - Android browsers
   * - iOS browsers
   * - Localhost development
   */

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );


  /*
   * ==========================================================
   * STATE
   * ==========================================================
   */

  const [
    step,
    setStep,
  ] = useState<1 | 2>(1);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    isCapturingLocation,
    setIsCapturingLocation,
  ] = useState(false);

  const [
    mediaPreview,
    setMediaPreview,
  ] = useState<string | null>(
    null
  );

  const [
    mediaFile,
    setMediaFile,
  ] = useState<File | null>(
    null
  );

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    success,
    setSuccess,
  ] = useState(false);


  /*
   * ==========================================================
   * FORM
   * ==========================================================
   */

  const form =
    useForm<ReportFormValues>({
      resolver:
        zodResolver(
          reportSchema
        ),

      defaultValues: {
        title: "",

        description: "",

        location: {
          address: "",
          latitude: 0,
          longitude: 0,
          ward: undefined,
        },

        media: [],
      },
    });


  /*
   * ==========================================================
   * PREVIEW CLEANUP
   * ==========================================================
   */

  useEffect(() => {

    return () => {

      if (mediaPreview) {
        URL.revokeObjectURL(
          mediaPreview
        );
      }

    };

  }, [mediaPreview]);


  /*
   * ==========================================================
   * OPEN FILE PICKER
   * ==========================================================
   */

  const openFilePicker =
    () => {

      if (isSubmitting) {
        return;
      }

      /*
       * Clear the value first.
       *
       * This is important because selecting the SAME image
       * twice should still trigger onChange.
       */

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";

        fileInputRef.current.click();
      }
    };


  /*
   * ==========================================================
   * PHOTO SELECTION
   * ==========================================================
   */

  const handlePhotoUpload =
    (
      event: ChangeEvent<HTMLInputElement>
    ) => {

      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      setError(null);


      /*
       * ------------------------------------------------------
       * IMAGE TYPE VALIDATION
       * ------------------------------------------------------
       */

      const isImage =
        file.type.startsWith(
          "image/"
        );


      /*
       * Some mobile devices may return an empty MIME type.
       *
       * In that case we also check the extension.
       */

      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase() || "";


      const allowedExtensions = [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "heic",
        "heif",
      ];


      const validImage =
        isImage ||
        allowedExtensions.includes(
          extension
        );


      if (!validImage) {

        setError(
          "Please select a valid image file."
        );

        event.target.value =
          "";

        return;
      }


      /*
       * ------------------------------------------------------
       * SIZE VALIDATION
       * ------------------------------------------------------
       */

      const maxSize =
        10 * 1024 * 1024;


      if (
        file.size >
        maxSize
      ) {

        setError(
          "Image size must be less than 10 MB."
        );

        event.target.value =
          "";

        return;
      }


      /*
       * ------------------------------------------------------
       * REMOVE OLD PREVIEW
       * ------------------------------------------------------
       */

      if (mediaPreview) {

        URL.revokeObjectURL(
          mediaPreview
        );
      }


      /*
       * ------------------------------------------------------
       * CREATE PREVIEW
       * ------------------------------------------------------
       */

      const objectUrl =
        URL.createObjectURL(
          file
        );


      /*
       * Store the REAL File.
       *
       * This is what gets uploaded to Supabase Storage
       * during complaint submission.
       */

      setMediaFile(
        file
      );


      setMediaPreview(
        objectUrl
      );


      form.setValue(
        "media",
        [objectUrl],
        {
          shouldDirty: true,
        }
      );


      /*
       * Reset input so the same image can be selected again.
       */

      event.target.value =
        "";
    };


  /*
   * ==========================================================
   * REMOVE / CHANGE PHOTO
   * ==========================================================
   */

  const handleRemovePhoto =
    () => {

      if (mediaPreview) {

        URL.revokeObjectURL(
          mediaPreview
        );
      }


      setMediaPreview(
        null
      );

      setMediaFile(
        null
      );


      form.setValue(
        "media",
        [],
        {
          shouldDirty: true,
        }
      );


      if (
        fileInputRef.current
      ) {

        fileInputRef.current.value =
          "";
      }
    };


  /*
   * ==========================================================
   * LOCATION
   * ==========================================================
   */

  async function reverseGeocodeLocation(
    latitude: number,
    longitude: number
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
          latitude
        )}&longitude=${encodeURIComponent(
          longitude
        )}&localityLanguage=en`
      );

      if (!response.ok) {
        throw new Error(
          `Reverse geocoding failed: ${response.status}`
        );
      }

      const data = await response.json();

      const parts = [
        data.locality,
        data.city,
        data.principalSubdivision,
        data.countryName,
      ].filter(
        (value): value is string =>
          Boolean(
            value &&
            typeof value === "string" &&
            value.trim()
          )
      );

      /*
       * Remove duplicate location names.
       *
       * Example:
       * Hyderabad, Hyderabad, Telangana, India
       *
       * becomes:
       * Hyderabad, Telangana, India
       */

      const uniqueParts = Array.from(
        new Set(
          parts.map((part) =>
            part.trim()
          )
        )
      );

      if (
        uniqueParts.length === 0
      ) {
        return null;
      }

      return uniqueParts.join(
        ", "
      );
    } catch (error) {
      console.error(
        "Reverse geocoding error:",
        error
      );

      return null;
    }
  }

  const handleCaptureLocation =
    () => {
      setError(null);

      setIsCapturingLocation(
        true
      );

      if (
        !navigator.geolocation
      ) {
        setError(
          "Location services are not supported by this browser."
        );

        setIsCapturingLocation(
          false
        );

        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latitude =
            position.coords.latitude;

          const longitude =
            position.coords.longitude;

          /*
           * ------------------------------------------------------
           * SAVE GPS COORDINATES
           * ------------------------------------------------------
           */

          form.setValue(
            "location.latitude",
            latitude,
            {
              shouldValidate: true,
              shouldDirty: true,
            }
          );

          form.setValue(
            "location.longitude",
            longitude,
            {
              shouldValidate: true,
              shouldDirty: true,
            }
          );

          /*
           * ------------------------------------------------------
           * REVERSE GEOCODING
           * ------------------------------------------------------
           *
           * Convert:
           *
           * 17.563915
           * 78.454832
           *
           * into:
           *
           * Hyderabad, Telangana, India
           */

          const locationName =
            await reverseGeocodeLocation(
              latitude,
              longitude
            );

          if (
            locationName
          ) {
            form.setValue(
              "location.address",
              locationName,
              {
                shouldValidate: true,
                shouldDirty: true,
              }
            );
          } else {
            /*
             * Fallback if the reverse-geocoding
             * service is temporarily unavailable.
             */

            form.setValue(
              "location.address",
              `GPS: ${latitude.toFixed(
                6
              )}, ${longitude.toFixed(
                6
              )}`,
              {
                shouldValidate: true,
                shouldDirty: true,
              }
            );
          }

          setIsCapturingLocation(
            false
          );
        },

        (geoError) => {
          console.error(
            "Geolocation error:",
            geoError
          );

          let message =
            "Unable to determine your current location.";

          switch (
          geoError.code
          ) {
            case geoError.PERMISSION_DENIED:
              message =
                "Location permission was denied. Please allow location access in your browser.";
              break;

            case geoError.POSITION_UNAVAILABLE:
              message =
                "Your current location is unavailable. Check your device location settings.";
              break;

            case geoError.TIMEOUT:
              message =
                "Location detection timed out. Please try again.";
              break;
          }

          setError(
            message
          );

          setIsCapturingLocation(
            false
          );
        },

        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    };


  /*
   * ==========================================================
   * STEP 1 → STEP 2
   * ==========================================================
   */

  const handleContinueToDetails =
    async () => {

      setError(null);


      const addressValid =
        await form.trigger(
          "location.address"
        );


      if (!addressValid) {
        return;
      }


      const latitude =
        form.getValues(
          "location.latitude"
        );


      const longitude =
        form.getValues(
          "location.longitude"
        );


      if (
        latitude === 0 ||
        longitude === 0
      ) {

        setError(
          "Please capture your current location before continuing."
        );

        return;
      }


      setStep(2);
    };


  /*
   * ==========================================================
   * SUBMIT COMPLAINT
   * ==========================================================
   */

  async function onSubmit(
    values: ReportFormValues
  ) {

    setIsSubmitting(
      true
    );

    setError(null);

    setSuccess(false);


    try {

      /*
       * ------------------------------------------------------
       * GPS VALIDATION
       * ------------------------------------------------------
       */

      if (
        values.location.latitude ===
        0 ||
        values.location.longitude ===
        0
      ) {

        throw new Error(
          "Please capture your current location before submitting the complaint."
        );
      }


      /*
       * ------------------------------------------------------
       * CREATE COMPLAINT
       * ------------------------------------------------------
       */

      const complaint =
        await createComplaint({

          title:
            values.title.trim(),

          description:
            values.description.trim(),

          /*
           * AI will classify this later.
           */

          category:
            "other",

          latitude:
            values.location.latitude,

          longitude:
            values.location.longitude,

          address:
            values.location.address.trim(),

          wardId:
            values.location.ward ??
            null,
        });


      console.log(
        "Complaint created:",
        complaint
      );


      /*
       * ------------------------------------------------------
       * UPLOAD EVIDENCE
       * ------------------------------------------------------
       */

      if (mediaFile) {

        try {

          const uploadedMedia =
            await uploadComplaintEvidence(
              complaint.id,
              mediaFile
            );


          console.log(
            "Evidence uploaded:",
            uploadedMedia
          );

        } catch (
        uploadError
        ) {

          console.error(
            "Evidence upload failed:",
            uploadError
          );


          setSuccess(
            true
          );


          setError(
            "Your complaint was submitted, but the photo could not be uploaded. You can add evidence later."
          );


          setIsSubmitting(
            false
          );


          setTimeout(() => {

            router.push(
              `/citizen/complaints/${complaint.id}`
            );

          }, 1800);


          return;
        }
      }


      /*
       * ------------------------------------------------------
       * SUCCESS
       * ------------------------------------------------------
       */

      setSuccess(
        true
      );


      if (mediaPreview) {

        URL.revokeObjectURL(
          mediaPreview
        );
      }


      setTimeout(() => {

        router.push(
          `/citizen/complaints/${complaint.id}?process=ai`
        );

      }, 800);

    } catch (
    submitError
    ) {

      console.error(
        "Failed to submit report:",
        submitError
      );


      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to submit the complaint. Please try again."
      );


      setIsSubmitting(
        false
      );
    }
  }


  /*
   * ==========================================================
   * WATCH LOCATION
   * ==========================================================
   */

  const latitude =
    form.watch(
      "location.latitude"
    );

  const longitude =
    form.watch(
      "location.longitude"
    );


  const hasLocation =
    latitude !== 0 &&
    longitude !== 0;


  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  return (

    <div className="mx-auto max-w-2xl">

      <PageHeader
        title="Report an Issue"
        description="Help us identify and fix problems in your area."
      />


      {/* ======================================================
          ERROR
      ======================================================= */}

      {error && (

        <Alert className="mb-6 border-destructive/20 bg-destructive/5 text-destructive">

          <AlertDescription>
            {error}
          </AlertDescription>

        </Alert>
      )}


      {/* ======================================================
          SUCCESS
      ======================================================= */}

      {success && (

        <Alert className="mb-6 border-green-200 bg-green-50 text-green-700">

          <CheckCircle2 className="h-4 w-4" />

          <AlertDescription>
            Complaint submitted successfully. Redirecting...
          </AlertDescription>

        </Alert>
      )}


      {/* ======================================================
          PROGRESS
      ======================================================= */}

      <div className="mb-8">

        <div className="mb-2 flex items-center justify-between text-sm font-medium">

          <span
            className={
              step === 1
                ? "text-primary"
                : "text-muted-foreground"
            }
          >
            Step 1: Evidence
          </span>


          <span
            className={
              step === 2
                ? "text-primary"
                : "text-muted-foreground"
            }
          >
            Step 2: Details
          </span>

        </div>


        <Progress
          value={
            step === 1
              ? 50
              : 100
          }
          className="h-2"
        />

      </div>


      <Form {...form}>

        <form
          onSubmit={form.handleSubmit(
            onSubmit
          )}
        >


          {/* ==================================================
              STEP 1
          ================================================== */}

          {step === 1 && (

            <div className="animate-in space-y-6 fade-in slide-in-from-right-4 duration-300">


              {/* ==================================================
                  EVIDENCE
              ================================================== */}

              <Card>

                <CardContent className="pt-6">

                  <div className="space-y-4">

                    <div>

                      <h3 className="text-lg font-medium">
                        Upload Evidence
                      </h3>

                      <p className="mb-4 text-sm text-muted-foreground">
                        Add a clear photo of the civic issue.
                      </p>


                      {/* =========================================
                          REAL FILE INPUT
                      ========================================= */}

                      <input
                        ref={
                          fileInputRef
                        }
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                        capture="environment"
                        onChange={
                          handlePhotoUpload
                        }
                        disabled={
                          isSubmitting
                        }
                        className="sr-only"
                        aria-label="Upload evidence image"
                      />


                      {/* =========================================
                          NO PHOTO
                      ========================================= */}

                      {!mediaPreview ? (

                        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6">

                          <div className="flex flex-col items-center text-center">

                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">

                              <Camera className="h-7 w-7" />

                            </div>


                            <h4 className="font-semibold">
                              Add a photo
                            </h4>


                            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                              Take a photo with your camera or choose an image from your device.
                            </p>


                            <div className="mt-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">

                              {/* =================================
                                  MAIN UPLOAD BUTTON
                              ================================= */}

                              <Button
                                type="button"
                                onClick={
                                  openFilePicker
                                }
                                disabled={
                                  isSubmitting
                                }
                                className="w-full sm:w-auto"
                              >

                                <ImagePlus className="mr-2 h-4 w-4" />

                                Upload Image

                              </Button>


                              {/* =================================
                                  CAMERA BUTTON
                              ================================= */}

                              <Button
                                type="button"
                                variant="outline"
                                onClick={
                                  openFilePicker
                                }
                                disabled={
                                  isSubmitting
                                }
                                className="w-full sm:w-auto"
                              >

                                <Camera className="mr-2 h-4 w-4" />

                                Take Photo

                              </Button>

                            </div>


                            <p className="mt-4 text-xs text-muted-foreground">
                              Maximum 10 MB · JPG, PNG, WEBP, HEIC, HEIF
                            </p>

                          </div>

                        </div>

                      ) : (

                        /* =======================================
                           PHOTO PREVIEW
                        ======================================= */

                        <div className="overflow-hidden rounded-xl border">

                          <div className="relative">

                            {/* eslint-disable-next-line @next/next/no-img-element */}

                            <img
                              src={
                                mediaPreview
                              }
                              alt="Civic issue evidence preview"
                              className="h-72 w-full object-cover"
                            />


                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="absolute right-3 top-3 shadow-md"
                              onClick={
                                handleRemovePhoto
                              }
                              disabled={
                                isSubmitting
                              }
                            >

                              <X className="mr-2 h-4 w-4" />

                              Change Photo

                            </Button>

                          </div>


                          {/* ===================================
                              FILE INFORMATION
                          =================================== */}

                          <div className="flex flex-col gap-2 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">

                            <div className="min-w-0">

                              <p className="truncate text-sm font-medium">
                                {mediaFile?.name ||
                                  "Selected image"}
                              </p>

                              <p className="text-xs text-muted-foreground">

                                {mediaFile
                                  ? `${(
                                    mediaFile.size /
                                    1024 /
                                    1024
                                  ).toFixed(
                                    2
                                  )} MB`
                                  : ""}

                              </p>

                            </div>


                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={
                                openFilePicker
                              }
                              disabled={
                                isSubmitting
                              }
                            >

                              <ImagePlus className="mr-2 h-4 w-4" />

                              Choose Another

                            </Button>

                          </div>

                        </div>
                      )}

                    </div>

                  </div>

                </CardContent>

              </Card>


              {/* ==================================================
                  LOCATION
              ================================================== */}

              <Card>

                <CardContent className="pt-6">

                  <FormField
                    control={
                      form.control
                    }
                    name="location.address"
                    render={({
                      field,
                    }) => (

                      <FormItem>

                        <FormLabel>
                          Location
                        </FormLabel>


                        <div className="flex gap-2">

                          <FormControl>

                            <Input
                              placeholder="Enter address or detect your current location"
                              disabled={
                                isSubmitting
                              }
                              {...field}
                            />

                          </FormControl>


                          <Button
                            type="button"
                            variant="outline"
                            onClick={
                              handleCaptureLocation
                            }
                            disabled={
                              isCapturingLocation ||
                              isSubmitting
                            }
                            title="Use my current location"
                          >

                            {isCapturingLocation ? (

                              <Loader2 className="h-4 w-4 animate-spin" />

                            ) : (

                              <LocateFixed className="h-4 w-4 text-primary" />

                            )}

                          </Button>

                        </div>


                        <FormMessage />

                      </FormItem>

                    )}
                  />


                  {/* =========================================
                      GPS STATUS
                  ========================================= */}

                  <div className="mt-4">

                    {hasLocation ? (

                      <div className="rounded-lg border border-green-200 bg-green-50 p-4">

                        <div className="flex items-start gap-3">

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">

                            <Navigation className="h-4 w-4 text-green-600" />

                          </div>


                          <div>

                            <p className="text-sm font-semibold text-green-800">
                              Location captured
                            </p>


                            <p className="mt-1 text-xs text-green-700">
                              Latitude:{" "}
                              {latitude.toFixed(
                                6
                              )}
                            </p>


                            <p className="text-xs text-green-700">
                              Longitude:{" "}
                              {longitude.toFixed(
                                6
                              )}
                            </p>

                          </div>

                        </div>

                      </div>

                    ) : (

                      <div className="rounded-lg border bg-muted/30 p-4">

                        <div className="flex items-start gap-3">

                          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />

                          <div>

                            <p className="text-sm font-medium">
                              Location not captured
                            </p>

                            <p className="mt-1 text-xs text-muted-foreground">
                              Tap the location button to capture your current GPS coordinates.
                            </p>

                          </div>

                        </div>

                      </div>
                    )}

                  </div>


                  {/* =========================================
                      MAP / LOCATION PREVIEW
                  ========================================= */}

                  <div className="relative mt-4 flex h-48 items-center justify-center overflow-hidden rounded-md border bg-muted">

                    {hasLocation ? (

                      <div className="flex flex-col items-center text-center">

                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">

                          <MapPin className="h-6 w-6" />

                        </div>

                        <p className="text-sm font-medium">
                          GPS location captured
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {latitude.toFixed(
                            6
                          )},{" "}
                          {longitude.toFixed(
                            6
                          )}
                        </p>

                      </div>

                    ) : (

                      <div className="flex flex-col items-center text-center text-muted-foreground">

                        <MapPin className="mb-2 h-8 w-8" />

                        <p className="text-sm">
                          Location preview
                        </p>

                      </div>

                    )}

                  </div>

                </CardContent>

              </Card>


              {/* ==================================================
                  CONTINUE
              ================================================== */}

              <div className="flex justify-end">

                <Button
                  type="button"
                  onClick={
                    handleContinueToDetails
                  }
                  disabled={
                    isSubmitting
                  }
                >

                  Continue

                  <ArrowRight className="ml-2 h-4 w-4" />

                </Button>

              </div>

            </div>
          )}


          {/* ==================================================
              STEP 2
          ================================================== */}

          {step === 2 && (

            <div className="animate-in space-y-6 fade-in slide-in-from-right-4 duration-300">

              <Card>

                <CardContent className="space-y-6 pt-6">

                  {/* =========================================
                      TITLE
                  ========================================= */}

                  <FormField
                    control={
                      form.control
                    }
                    name="title"
                    render={({
                      field,
                    }) => (

                      <FormItem>

                        <FormLabel>
                          Issue Title
                        </FormLabel>

                        <FormControl>

                          <Input
                            placeholder="e.g. Large pothole near main road"
                            disabled={
                              isSubmitting
                            }
                            {...field}
                          />

                        </FormControl>

                        <FormMessage />

                      </FormItem>
                    )}
                  />


                  {/* =========================================
                      DESCRIPTION
                  ========================================= */}

                  <FormField
                    control={
                      form.control
                    }
                    name="description"
                    render={({
                      field,
                    }) => (

                      <FormItem>

                        <FormLabel>
                          Describe the Issue
                        </FormLabel>

                        <FormControl>

                          <Textarea
                            placeholder="Describe what is happening, how serious it is, and any details that may help the authorities."
                            className="min-h-36 resize-none"
                            disabled={
                              isSubmitting
                            }
                            {...field}
                          />

                        </FormControl>

                        <FormMessage />

                      </FormItem>
                    )}
                  />


                  {/* =========================================
                      ATTACHMENT SUMMARY
                  ========================================= */}

                  {mediaFile && (

                    <div className="rounded-lg border bg-muted/30 p-4">

                      <div className="flex items-center gap-3">

                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">

                          <ImagePlus className="h-5 w-5" />

                        </div>


                        <div className="min-w-0">

                          <p className="truncate text-sm font-medium">
                            {mediaFile.name}
                          </p>

                          <p className="text-xs text-muted-foreground">

                            {(
                              mediaFile.size /
                              1024 /
                              1024
                            ).toFixed(
                              2
                            )}{" "}
                            MB

                          </p>

                        </div>

                      </div>

                    </div>
                  )}

                </CardContent>

              </Card>


              {/* ==================================================
                  ACTIONS
              ================================================== */}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setStep(1)
                  }
                  disabled={
                    isSubmitting
                  }
                >
                  Back
                </Button>


                <Button
                  type="submit"
                  disabled={
                    isSubmitting
                  }
                  className="sm:min-w-40"
                >

                  {isSubmitting ? (

                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />

                      Submitting...
                    </>

                  ) : (

                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />

                      Submit Complaint
                    </>

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