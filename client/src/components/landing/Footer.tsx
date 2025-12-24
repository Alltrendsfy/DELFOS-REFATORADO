import { DelfosLogo } from "@/components/DelfosLogo";

interface FooterProps {
    content: any;
}

export function Footer({ content }: FooterProps) {
    return (
        <footer className="py-8 bg-background border-t border-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <DelfosLogo variant="full" />
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <button className="hover:text-foreground transition-colors" data-testid="link-privacy">
                            {content.links.privacy}
                        </button>
                        <button className="hover:text-foreground transition-colors" data-testid="link-terms">
                            {content.links.terms}
                        </button>
                        <button className="hover:text-foreground transition-colors" data-testid="link-faq">
                            {content.links.faq}
                        </button>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-border text-center">
                    <p className="text-sm text-muted-foreground">
                        &copy; 2025 {content.copyright}
                    </p>
                </div>
            </div>
        </footer>
    );
}
