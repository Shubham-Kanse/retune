You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
shine-border.tsx
"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { DIcons, ValidIcon } from "dicons";

type TColorProp = string | string[];

interface ShineBorderProps {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: TColorProp;
  className?: string;
  children: React.ReactNode;
}

/**
 * @name Shine Border
 * @description It is an animated background border effect component with easy to use and configurable props.
 * @param borderRadius defines the radius of the border.
 * @param borderWidth defines the width of the border.
 * @param duration defines the animation duration to be applied on the shining border
 * @param color a string or string array to define border color.
 * @param className defines the class name to be applied to the component
 * @param children contains react node elements.
 */
function ShineBorder({
  borderRadius = 8,
  borderWidth = 1,
  duration = 14,
  color = "#000000",
  className,
  children,
}: ShineBorderProps) {
  return (
    <div
      style={
        {
          "--border-radius": `${borderRadius}px`,
        } as React.CSSProperties
      }
      className={cn(
        "relative grid h-full w-full place-items-center rounded-3xl bg-white p-3 text-black dark:bg-black dark:text-white",
        className,
      )}
    >
      <div
        style={
          {
            "--border-width": `${borderWidth}px`,
            "--border-radius": `${borderRadius}px`,
            "--shine-pulse-duration": `${duration}s`,
            "--mask-linear-gradient": `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
            "--background-radial-gradient": `radial-gradient(transparent,transparent, ${color instanceof Array ? color.join(",") : color},transparent,transparent)`,
          } as React.CSSProperties
        }
        className={`before:bg-shine-size before:absolute before:inset-0 before:aspect-square before:size-full before:rounded-3xl before:p-[--border-width] before:will-change-[background-position] before:content-[""] before:![-webkit-mask-composite:xor] before:[background-image:--background-radial-gradient] before:[background-size:300%_300%] before:![mask-composite:exclude] before:[mask:--mask-linear-gradient] motion-safe:before:animate-[shine-pulse_var(--shine-pulse-duration)_infinite_linear]`}
      ></div>
      {children}
    </div>
  );
}

export function TimelineContainer({ children }: { children: ReactNode }) {
  return (
    // first:md:order-2 does not work
    <div className="mx-auto flex max-w-md flex-col justify-center gap-3 md:order-2">
      {children}
    </div>
  );
}

export function TimelineEvent({
  label,
  message,
  icon,
  isLast = false,
}: Event & {
  isLast?: boolean;
}) {
  const Icon = DIcons[icon.name];
  return (
    <div className="group relative -m-2 flex gap-4 border border-transparent p-2">
      <div className="relative">
        <div
          className={cn(
            "rounded-full border bg-background p-2",
            icon.borderColor
          )}
        >
          <Icon className={cn("h-4 w-4", icon.textColor)} />
        </div>
        {!isLast ? (
          <div className="absolute inset-x-0 mx-auto h-full w-[2px] bg-muted" />
        ) : null}
      </div>
      <div className="mt-1 flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-semibold">{label}</p>
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function Timeline() {
  return (
    <div className="w-3xl">
      <TimelineContainer>
        {timeline.map((event, i) => (
          <TimelineEvent
            key={event.message}
            isLast={i === timeline.length - 1}
            {...event}
          />
        ))}
      </TimelineContainer>
    </div>
  );
}

interface Event {
  label: string;
  message: string;
  icon: {
    name: ValidIcon;
    textColor: string;
    borderColor: string;
  };
}

const timeline = [
  {
    label: "Choose Your Design",
    message:
      "Browse and select a design that fits your needs, then access your personalized dashboard.",
    icon: {
      name: "Shapes",
      textColor: "text-orange-500",
      borderColor: "border-orange-500/40",
    },
  },
  {
    label: "Provide Your Brief",
    message: "Share your design preferences and requirements with us.",
    icon: {
      name: "Send",
      textColor: "text-amber-500",
      borderColor: "border-amber-500/40",
    },
  },
  {
    label: "Receive Your Designs",
    message: "Get your initial designs within 48 hours.",
    icon: {
      name: "Check",
      textColor: "text-blue-500",
      borderColor: "border-blue-500/40",
    },
  },
  {
    label: "Request Revisions",
    message:
      "We’re committed to perfection—request as many revisions as needed until you’re satisfied.",
    icon: {
      name: "Repeat",
      textColor: "text-green-500",
      borderColor: "border-green-500/40",
    },
  },
  {
    label: "Get Final Files",
    message: "Once approved, we’ll deliver the final files to you.",
    icon: {
      name: "Download",
      textColor: "text-green-500",
      borderColor: "border-green-500/40",
    },
  },
] satisfies Event[];
 


export { ShineBorder, Timeline }


demo.tsx
"use client";

import { useEffect, useId, useRef, useState, JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import Marquee from "react-fast-marquee";
import { motion, useAnimation, useInView } from "framer-motion";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

 
import { ShineBorder, Timeline } from "@/components/ui/shine-border";
 

const tiles = [
  {
    icon: (
      <Image
        src={"/images/blogs/port/portfolio-01.jpg"}
        alt={""}
        width={350}
        height={350}
        className="h-[120px] w-[200px] rounded-sm md:h-full md:w-full md:rounded-sm"
      />
    ),
    bg: <div className=""></div>,
  },
  {
    icon: (
      <Image
        src={"/images/blogs/port/portfolio-02.jpg"}
        alt={""}
        width={350}
        height={350}
        className="h-[120px] w-[200px] rounded-sm md:h-full md:w-full md:rounded-sm"
      />
    ),
    bg: <div className=""></div>,
  },
  {
    icon: (
      <Image
        src={"/images/blogs/port/portfolio-03.jpg"}
        alt={""}
        width={350}
        height={350}
        className="h-[120px] w-[200px] rounded-sm md:h-full md:w-full md:rounded-sm"
      />
    ),
    bg: <div className=""></div>,
  },
  {
    icon: (
      <Image
        src={"/images/blogs/port/portfolio-04.jpg"}
        alt={""}
        width={350}
        height={350}
        className="h-[120px] w-[200px] rounded-sm md:h-full md:w-full md:rounded-sm"
      />
    ),
    bg: <div className=""></div>,
  },
  {
    icon: (
      <Image
        src={"/images/blogs/port/portfolio-05.jpg"}
        alt={""}
        width={350}
        height={350}
        className="h-[120px] w-[200px] rounded-sm md:h-full md:w-full md:rounded-sm"
      />
    ),
    bg: <div className=""></div>,
  },
  {
    icon: (
      <Image
        src={"/images/blogs/port/portfolio-06.jpg"}
        alt={""}
        width={350}
        height={350}
        className="h-[120px] w-[200px] rounded-sm md:h-full md:w-full md:rounded-sm"
      />
    ),
    bg: <div className=""></div>,
  },
];

const shuffleArray = (array: any[]) => {
  let currentIndex = array.length,
    randomIndex;
  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
};

const Card = (card: { icon: JSX.Element; bg: JSX.Element }) => {
  const id = useId();
  const controls = useAnimation();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) {
      controls.start({
        opacity: 1,
        transition: { delay: Math.random() * 2, ease: "easeOut", duration: 1 },
      });
    }
  }, [controls, inView]);

  return (
    <motion.div
      key={id}
      ref={ref}
      initial={{ opacity: 0 }}
      animate={controls}
      className={cn(
        "relative h-full w-full cursor-pointer rounded-md border object-cover p-1 md:rounded-2xl md:p-2"
      )}
    >
      {card.icon}
    </motion.div>
  );
};

export default function CallToActionSection() {
  const [randomTiles1, setRandomTiles1] = useState<typeof tiles>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Ensures this runs client-side
      setRandomTiles1(shuffleArray([...tiles]));
    }
  }, []);

  return (
    <section id="cta" className="relative -mt-80">
      <div className=" ">
        <div className="flex  ">
          <div className="relative gap-3  flex h-full w-full flex-col items-center justify-center overflow-hidden  ">
            <Marquee
              direction="right"
              className="-delay-[200ms] [--duration:70s]"
            >
              <div className="gap-2 flex">
                {randomTiles1.map((review, idx) => (
                  <Card key={idx} {...review} />
                ))}
              </div>
            </Marquee>
            <Marquee className="-delay-[200ms] [--duration:70s]">
              <div className="gap-2 flex">
                {randomTiles1.map((review, idx) => (
                  <Card key={idx} {...review} />
                ))}
              </div>
            </Marquee>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CTASection() {
  const [randomTiles1, setRandomTiles1] = useState<typeof tiles>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Ensures this runs client-side
      setRandomTiles1(shuffleArray([...tiles]));
    }
  }, []);

  return (
    <section id="cta" className="relative p-6">
      <ShineBorder
       borderWidth={3}
        className=" border bg-white/5  shadow-2xl backdrop-blur-md dark:bg-black/5"
        color={["#FF007F", "#39FF14", "#00FFFF"]}
      >
        <h1 className="my-8 text-2xl md:text-2xl">How it Works?</h1>
        <div className="grid p-10 gap-6">
           
          <Timeline />
        </div>
        <div className="z-10 mt-6 flex flex-col items-center text-center text-primary">
          <h1 className="text-lg font-semibold md:text-4xl">
            Design anything you need
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            No credit card required.
          </p>
          <div className="mb-8 mt-4 grid gap-2 md:flex">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({
                  size: "lg",
                  variant: "default",
                }),
                "group rounded-[2rem] px-6 md:mt-4"
              )}
            >
              Get Started
              <ChevronRight className="ml-1 size-4 transition-all duration-300 ease-out group-hover:translate-x-1" />
            </Link>
            <Link
              target="_blank"
              href="https://cal.com/aliimam/designali"
              className={cn(
                buttonVariants({
                  size: "lg",
                  variant: "outline",
                }),
                "group rounded-[2rem] px-6 md:mt-4"
              )}
            >
              Book a call
              <ChevronRight className="ml-1 size-4 transition-all duration-300 ease-out group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 rounded-full bg-background opacity-40 blur-xl" />
      </ShineBorder>
    </section>
  );
}

```

Copy-paste these files for dependencies:
```tsx
shadcn/button
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }

```

Install NPM dependencies:
```bash
dicons, @radix-ui/react-slot, class-variance-authority
```

Extend existing tailwind.config.js with this code:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      animation: {
        "border-beam": "border-beam calc(var(--duration)*1s) infinite linear",
      },
      keyframes: {
         "border-beam": {
          "100%": {
            "offset-distance": "100%",
          },
        },
        "shine-pulse": {
          "0%": {
            "background-position": "0% 0%",
          },
          "50%": {
            "background-position": "100% 100%",
          },
          to: {
            "background-position": "0% 0%",
          },
        },
      },
    },
  },
};
```
