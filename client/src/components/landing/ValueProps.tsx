import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, Bot } from "lucide-react";
import { iconMap } from "./utils";

interface ValuePropsProps {
    content: any;
    navLabel: string;
}

export function ValueProps({ content, navLabel }: ValuePropsProps) {
    return (
        <section id="benefits" className="py-20 sm:py-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <Badge variant="outline" className="mb-4 border-[#5B9FB5]/50 text-[#5B9FB5]">
                        <Award className="w-4 h-4 mr-2" />
                        {navLabel}
                    </Badge>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {content.title}
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        {content.subtitle}
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {content.items.map((item: any, index: number) => {
                        const IconComponent = iconMap[item.icon] || Bot;
                        return (
                            <Card
                                key={index}
                                className="p-6 hover-elevate border-border/50 bg-card/50 backdrop-blur-sm"
                                data-testid={`card-value-prop-${index}`}
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5B9FB5]/20 to-[#7DD3E8]/20 flex items-center justify-center mb-4">
                                    <IconComponent className="w-6 h-6 text-[#5B9FB5]" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">
                                    {item.title}
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
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
