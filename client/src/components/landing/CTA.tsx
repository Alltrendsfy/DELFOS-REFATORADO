import { Button } from "@/components/ui/button";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Rocket, ArrowRight } from "lucide-react";

interface CTAProps {
    content: any;
    onScrollToSection: (id: string) => void;
}

export function CTA({ content, onScrollToSection }: CTAProps) {
    return (
        <section className="py-20 sm:py-24 bg-gradient-to-br from-[#1A1D23] via-[#2A3040] to-[#1A1D23] relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                    backgroundImage: `linear-gradient(to right, #5B9FB5 1px, transparent 1px),
                           linear-gradient(to bottom, #5B9FB5 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }} />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#5B9FB5]/10 rounded-full blur-3xl" />

            <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div className="flex justify-center mb-8">
                    <DelfosLogo variant="icon" className="w-20 h-20" />
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                    {content.title}
                </h2>
                <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
                    {content.subtitle}
                </p>
                <Button
                    size="lg"
                    className="px-10 py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white shadow-lg shadow-[#5B9FB5]/25"
                    onClick={() => onScrollToSection('plans')}
                    data-testid="button-cta-final"
                >
                    <Rocket className="mr-2 w-5 h-5" />
                    {content.button}
                    <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
            </div>
        </section>
    );
}
