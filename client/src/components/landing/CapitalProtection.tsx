import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CapitalProtectionProps {
    content: any;
}

export function CapitalProtection({ content }: CapitalProtectionProps) {
    const { language } = useLanguage();

    return (
        <section id="protection" className="py-20 sm:py-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <Badge variant="outline" className="mb-4 border-green-500/50 text-green-500">
                        <Shield className="w-4 h-4 mr-2" />
                        {language === 'pt-BR' ? 'Seguranca' : language === 'es' ? 'Seguridad' : 'Security'}
                    </Badge>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {content.title || "Capital Protection"}
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        {content.subtitle || "Your clients' security is our priority."}
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(content.items || []).map((item: any, index: number) => (
                        <Card
                            key={index}
                            className="p-6 border-green-500/20 bg-green-500/5 hover-elevate"
                            data-testid={`card-protection-${index}`}
                        >
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground mb-2">
                                {item.title}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {item.description}
                            </p>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
