import { Button } from "@/components/ui/button";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Globe, Moon, Sun, LogIn } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/components/ThemeProvider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-white/80 hover:text-white hover:bg-white/10"
            data-testid="button-theme-toggle-landing"
        >
            {theme === 'light' ? (
                <Moon className="w-5 h-5" />
            ) : (
                <Sun className="w-5 h-5" />
            )}
        </Button>
    );
}

function LanguageSelector() {
    const { language, setLanguage } = useLanguage();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/80 hover:text-white hover:bg-white/10"
                    data-testid="button-language-selector-landing"
                >
                    <Globe className="w-5 h-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onClick={() => setLanguage('en')}
                    className={language === 'en' ? 'bg-accent' : ''}
                    data-testid="option-language-en-landing"
                >
                    English
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setLanguage('es')}
                    className={language === 'es' ? 'bg-accent' : ''}
                    data-testid="option-language-es-landing"
                >
                    Espanol
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setLanguage('pt-BR')}
                    className={language === 'pt-BR' ? 'bg-accent' : ''}
                    data-testid="option-language-pt-landing"
                >
                    Portugues (BR)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

interface HeaderProps {
    content: any;
    onScrollToSection: (id: string) => void;
    onOpenLoginModal: () => void;
}

export function Header({ content, onScrollToSection, onOpenLoginModal }: HeaderProps) {
    return (
        <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <nav className="flex justify-between items-center">
                <DelfosLogo variant="full" className="[&_span]:text-white [&_.text-muted-foreground]:text-white/60" />
                <div className="hidden md:flex items-center gap-8">
                    <button
                        onClick={() => onScrollToSection('benefits')}
                        className="text-white/80 hover:text-white text-sm font-medium transition-colors"
                        data-testid="nav-benefits"
                    >
                        {content.benefits}
                    </button>
                    <button
                        onClick={() => onScrollToSection('plans')}
                        className="text-white/80 hover:text-white text-sm font-medium transition-colors"
                        data-testid="nav-plans"
                    >
                        {content.plans}
                    </button>
                    <button
                        onClick={() => onScrollToSection('contact')}
                        className="text-white/80 hover:text-white text-sm font-medium transition-colors"
                        data-testid="nav-contact"
                    >
                        {content.contact}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <LanguageSelector />
                    <ThemeToggle />
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-white/30 text-white hover:bg-white/10 ml-2"
                        onClick={onOpenLoginModal}
                        data-testid="button-login-nav"
                    >
                        <LogIn className="w-4 h-4 mr-2" />
                        Login
                    </Button>
                </div>
            </nav>
        </header>
    );
}
