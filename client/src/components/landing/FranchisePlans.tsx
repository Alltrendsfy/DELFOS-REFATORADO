import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Loader2, CheckCircle2, ArrowRight, Shield, Target, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

interface FranchisePlan {
    id: string;
    name: string;
    code: string;
    franchise_fee_usd: string;
    max_rbm_multiplier: string;
    is_active: boolean;
}

interface FranchisePlansProps {
    content: any;
    navLabel: string;
}

export function FranchisePlans({ content, navLabel }: FranchisePlansProps) {
    const { language } = useLanguage();
    const [, setLocation] = useLocation();

    const { data: plans, isLoading: plansLoading } = useQuery<FranchisePlan[]>({
        queryKey: ['/api/franchise-plans'],
    });

    const handleSelectPlan = (planCode: string) => {
        setLocation(`/franchise/onboarding?plan=${planCode}`);
    };

    const getPlanColor = (code: string) => {
        if (code === 'starter') return { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-500/10', lightText: 'text-green-600', icon: Shield };
        if (code === 'pro') return { bg: 'bg-[#5B9FB5]', text: 'text-[#5B9FB5]', light: 'bg-[#5B9FB5]/10', lightText: 'text-[#5B9FB5]', icon: Target, isMostPopular: true };
        if (code === 'enterprise') return { bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-500/10', lightText: 'text-orange-600', icon: Building2 };
        return { bg: 'bg-gray-500', text: 'text-gray-500', light: 'bg-gray-500/10', lightText: 'text-gray-600', icon: Shield };
    };

    return (
        <section id="plans" className="py-20 sm:py-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <Badge variant="outline" className="mb-4 border-[#5B9FB5]/50 text-[#5B9FB5]">
                        <Layers className="w-4 h-4 mr-2" />
                        {navLabel}
                    </Badge>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {content.title}
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        {content.subtitle}
                    </p>
                </div>

                {plansLoading ? (
                    <div className="flex justify-center items-center min-h-96">
                        <Loader2 className="w-8 h-8 animate-spin text-[#5B9FB5]" />
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {plans?.map((plan) => {
                            const colors = getPlanColor(plan.code);
                            const IconComponent = colors.icon;
                            const isMostPopular = colors.isMostPopular;
                            const fee = parseFloat(plan.franchise_fee_usd);
                            const feeStr = language === 'pt-BR'
                                ? `R$ ${(fee * 5.5).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : `$${fee.toLocaleString()}`;
                            const planConfig = content[plan.code as keyof typeof content] as any;
                            const description = planConfig?.description || 'Professional franchise plan';
                            const features = planConfig?.features || [];
                            const cta = planConfig?.cta || 'Select Plan';

                            return (
                                <Card
                                    key={plan.id}
                                    className={`p-6 relative ${isMostPopular
                                            ? 'border-[#5B9FB5] bg-card ring-2 ring-[#5B9FB5]/20'
                                            : 'border-border/50 bg-card hover-elevate'
                                        }`}
                                    data-testid={`card-plan-${plan.code}`}
                                >
                                    {isMostPopular && (
                                        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] text-xs">
                                            {content.pro.badge}
                                        </Badge>
                                    )}

                                    <div className={`mb-4 ${isMostPopular ? 'mt-2' : ''}`}>
                                        <div className={`w-10 h-10 rounded-xl ${colors.light} flex items-center justify-center mb-3`}>
                                            <IconComponent className={`w-5 h-5 ${colors.text}`} />
                                        </div>
                                        <h3 className="text-xl font-bold text-foreground mb-1">{plan.name}</h3>
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                    </div>

                                    <div className="mb-2">
                                        <div className="text-2xl font-bold text-foreground">{feeStr}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {language === 'pt-BR' ? 'Taxa de Franquia' : language === 'es' ? 'Tarifa de Franquicia' : 'Franchise Fee'}
                                        </div>
                                    </div>

                                    <div className={`mb-4 py-2 px-3 ${colors.light} rounded-lg`}>
                                        <div className={`text-lg font-bold ${colors.text}`}>{plan.max_rbm_multiplier}x</div>
                                        <div className={`text-xs ${colors.lightText}`}>
                                            {language === 'pt-BR' ? 'Multiplicador de Risco Máximo' : language === 'es' ? 'Multiplicador de Riesgo Máximo' : 'Max Risk Multiplier'}
                                        </div>
                                    </div>

                                    <ul className="space-y-2 mb-6">
                                        {features.map((feature: string, index: number) => (
                                            <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                                                <CheckCircle2 className={`w-3 h-3 ${colors.text} flex-shrink-0 mt-0.5`} />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>

                                    <Button
                                        className={isMostPopular ? `w-full bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white` : 'w-full'}
                                        variant={isMostPopular ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleSelectPlan(plan.code)}
                                        data-testid={`button-plan-${plan.code}`}
                                    >
                                        {cta}
                                        <ArrowRight className="w-3 h-3 ml-1" />
                                    </Button>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
