interface StatsProps {
    content: any;
}

export function Stats({ content }: StatsProps) {
    return (
        <section className="py-16 bg-gradient-to-r from-[#5B9FB5]/10 via-[#7DD3E8]/10 to-[#5B9FB5]/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="text-center" data-testid="stat-franchises">
                        <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                            {content.franchises}
                        </div>
                        <div className="text-sm text-muted-foreground uppercase tracking-wide">
                            {content.franchisesLabel}
                        </div>
                    </div>
                    <div className="text-center" data-testid="stat-countries">
                        <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                            {content.countries}
                        </div>
                        <div className="text-sm text-muted-foreground uppercase tracking-wide">
                            {content.countriesLabel}
                        </div>
                    </div>
                    <div className="text-center" data-testid="stat-clients">
                        <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                            {content.clients}
                        </div>
                        <div className="text-sm text-muted-foreground uppercase tracking-wide">
                            {content.clientsLabel}
                        </div>
                    </div>
                    <div className="text-center" data-testid="stat-volume">
                        <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                            {content.volume}
                        </div>
                        <div className="text-sm text-muted-foreground uppercase tracking-wide">
                            {content.volumeLabel}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
