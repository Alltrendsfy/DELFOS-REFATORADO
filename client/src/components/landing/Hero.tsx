import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Building2, Rocket, ArrowRight } from "lucide-react";

interface HeroProps {
    content: any;
    onScrollToSection: (id: string) => void;
    children?: ReactNode;
}

export function Hero({ content, onScrollToSection, children }: HeroProps) {
    return (
        <section className="relative overflow-hidden">
            {/* Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#1A1D23] via-[#2A3040] to-[#1A1D23]" />

            {/* Animated Grid Pattern */}
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                    backgroundImage: `linear-gradient(to right, #5B9FB5 1px, transparent 1px),
                           linear-gradient(to bottom, #5B9FB5 1px, transparent 1px)`,
                    backgroundSize: '60px 60px'
                }} />
            </div>

            {/* Glowing Orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#5B9FB5]/20 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#7DD3E8]/20 rounded-full blur-3xl" />

            <div className="relative z-10">
                {children}

                {/* Hero Content */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24 sm:pt-20 sm:pb-32">
                    <div className="text-center">
                        {/* Badge */}
                        <Badge
                            variant="outline"
                            className="mb-6 px-4 py-1.5 text-sm border-[#7DD3E8]/50 text-[#7DD3E8] bg-[#7DD3E8]/10"
                            data-testid="badge-hero"
                        >
                            <Building2 className="w-4 h-4 mr-2" />
                            {content.badge}
                        </Badge>

                        {/* Logo 3D */}
                        <div className="flex justify-center mb-8 logo-3d-container">
                            <div className="logo-3d-rotate">
                                <DelfosLogo variant="icon" className="w-32 h-32 sm:w-40 sm:h-40" />
                            </div>
                        </div>

                        {/* Title */}
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">
                            {content.title}
                            <span className="block mt-2 bg-gradient-to-r from-[#5B9FB5] via-[#7DD3E8] to-[#5B9FB5] bg-clip-text text-transparent">
                                {content.titleHighlight}
                            </span>
                        </h1>

                        {/* Subtitle */}
                        <p className="text-lg sm:text-xl text-white/70 max-w-3xl mx-auto mb-10">
                            {content.subtitle}
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button
                                size="lg"
                                className="px-8 py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white shadow-lg shadow-[#5B9FB5]/25"
                                onClick={() => onScrollToSection('plans')}
                                data-testid="button-cta-hero"
                            >
                                <Rocket className="mr-2 w-5 h-5" />
                                {content.cta}
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className="px-8 py-6 text-lg border-white/30 text-white hover:bg-white/10"
                                onClick={() => onScrollToSection('benefits')}
                                data-testid="button-learn-more"
                            >
                                {content.ctaSecondary}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Wave Divider */}
                <div className="absolute bottom-0 left-0 right-0">
                    <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                        <path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" className="fill-background" />
                    </svg>
                </div>
            </div>
        </section>
    );
}
