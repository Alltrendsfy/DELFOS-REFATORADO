import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface TestimonialsProps {
    content: any;
}

export function Testimonials({ content }: TestimonialsProps) {
    return (
        <section className="py-20 sm:py-24 bg-muted/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {content.title}
                    </h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {content.items.map((testimonial: any, index: number) => (
                        <Card key={index} className="p-6 bg-card border-border/50" data-testid={`testimonial-${index}`}>
                            <div className="mb-4">
                                <Sparkles className="w-8 h-8 text-[#7DD3E8]" />
                            </div>
                            <p className="text-foreground italic mb-6">"{testimonial.quote}"</p>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5B9FB5] to-[#7DD3E8] flex items-center justify-center">
                                    <span className="text-white font-semibold text-sm">{testimonial.name.charAt(0)}</span>
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">{testimonial.name}</div>
                                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
