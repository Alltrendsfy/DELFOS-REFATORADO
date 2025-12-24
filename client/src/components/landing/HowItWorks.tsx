interface HowItWorksProps {
    content: any;
}

export function HowItWorks({ content }: HowItWorksProps) {
    return (
        <section className="py-20 sm:py-24 bg-muted/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {content.title}
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        {content.subtitle}
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {content.steps.map((step: any, index: number) => (
                        <div key={index} className="text-center" data-testid={`step-${index}`}>
                            <div className="relative inline-block mb-6">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5B9FB5] to-[#7DD3E8] flex items-center justify-center">
                                    <span className="text-2xl font-bold text-white">{step.number}</span>
                                </div>
                                {index < 3 && (
                                    <div className="hidden lg:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-[#7DD3E8] to-transparent" />
                                )}
                            </div>
                            <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                            <p className="text-sm text-muted-foreground">{step.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
