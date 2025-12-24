import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Bot } from "lucide-react";
import { iconMap } from "./utils";

interface TechnologyProps {
    content: any;
}

export function Technology({ content }: TechnologyProps) {
    return (
        <section id="technology" className="py-20 sm:py-24 bg-gradient-to-br from-[#1A1D23] via-[#2A3040] to-[#1A1D23] relative overflow-hidden">
            <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0" style={{
                    backgroundImage: `linear-gradient(to right, #5B9FB5 1px, transparent 1px),
                           linear-gradient(to bottom, #5B9FB5 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }} />
            </div>
            <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-[#5B9FB5]/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-[#7DD3E8]/10 rounded-full blur-3xl" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center mb-16">
                    <Badge variant="outline" className="mb-4 border-[#7DD3E8]/50 text-[#7DD3E8] bg-[#7DD3E8]/10">
                        <Zap className="w-4 h-4 mr-2" />
                        V2.0+
                    </Badge>
                    <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                        {content.title || "Cutting-Edge Technology"}
                    </h2>
                    <p className="text-lg text-white/70 max-w-2xl mx-auto">
                        {content.subtitle || "A complete ecosystem that automates every aspect of professional trading."}
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(content.items || []).map((item: any, index: number) => {
                        const IconComponent = iconMap[item.icon] || Bot;
                        return (
                            <Card
                                key={index}
                                className="p-6 bg-white/5 border-white/10 backdrop-blur-sm hover-elevate"
                                data-testid={`card-technology-${index}`}
                            >
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5B9FB5] to-[#7DD3E8] flex items-center justify-center mb-4 shadow-lg shadow-[#5B9FB5]/25">
                                    <IconComponent className="w-7 h-7 text-white" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">
                                    {item.title}
                                </h3>
                                <p className="text-sm text-white/60 leading-relaxed">
                                    {item.description}
                                </p>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
