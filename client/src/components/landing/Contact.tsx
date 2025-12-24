import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MapPin, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ContactProps {
    content: any;
    navLabel: string;
    onScrollToSection: (id: string) => void;
}

export function Contact({ content, navLabel, onScrollToSection }: ContactProps) {
    const { language } = useLanguage();

    return (
        <section id="contact" className="py-20 sm:py-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <Badge variant="outline" className="mb-4 border-[#5B9FB5]/50 text-[#5B9FB5]">
                            <Phone className="w-4 h-4 mr-2" />
                            {navLabel}
                        </Badge>
                        <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                            {content.title}
                        </h2>
                        <p className="text-lg text-muted-foreground mb-8">
                            {content.subtitle}
                        </p>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <Mail className="w-5 h-5 text-[#5B9FB5]" />
                                {content.info.email}
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <Phone className="w-5 h-5 text-[#5B9FB5]" />
                                {content.info.phone}
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <MapPin className="w-5 h-5 text-[#5B9FB5]" />
                                {content.info.address}
                            </div>
                        </div>
                    </div>

                    <Card className="p-8 bg-card border-border/50">
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">{language === 'pt-BR' ? 'Horário de Atendimento' : language === 'es' ? 'Horario de Atención' : 'Business Hours'}</h3>
                                <p className="text-sm text-muted-foreground">{language === 'pt-BR' ? 'Segunda a Sexta, 9h-18h (Horário de Brasília)' : language === 'es' ? 'Lunes a Viernes, 9:00-18:00 (Zona Horaria de Brasil)' : 'Monday to Friday, 9:00 AM - 6:00 PM (Brasilia Time)'}</p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-foreground mb-4">{language === 'pt-BR' ? 'Redes Sociais' : language === 'es' ? 'Redes Sociales' : 'Follow Us'}</h3>
                                <div className="flex gap-3">
                                    <Button size="sm" variant="outline" className="flex-1">{language === 'pt-BR' ? 'LinkedIn' : language === 'es' ? 'LinkedIn' : 'LinkedIn'}</Button>
                                    <Button size="sm" variant="outline" className="flex-1">{language === 'pt-BR' ? 'Twitter' : language === 'es' ? 'Twitter' : 'Twitter'}</Button>
                                    <Button size="sm" variant="outline" className="flex-1">{language === 'pt-BR' ? 'YouTube' : language === 'es' ? 'YouTube' : 'YouTube'}</Button>
                                </div>
                            </div>

                            <Button
                                className="w-full bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white"
                                onClick={() => onScrollToSection('plans')}
                                data-testid="button-contact-view-plans"
                            >
                                {language === 'pt-BR' ? 'Ver Planos de Franquia' : language === 'es' ? 'Ver Planes de Franquicia' : 'View Franchise Plans'}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </section>
    );
}
