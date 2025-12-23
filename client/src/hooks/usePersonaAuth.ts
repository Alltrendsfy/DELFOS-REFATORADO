import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface PersonaSession {
  authenticated: boolean;
  personaType?: string;
  email?: string;
  franchiseId?: string;
}

export function usePersonaAuth() {
  const [, setLocation] = useLocation();
  
  const { data: session, isLoading } = useQuery<PersonaSession>({
    queryKey: ['/api/auth/persona/session'],
    refetchInterval: 60000, // Refresh every minute
    retry: false,
  });

  // If not authenticated and not loading, redirect to login based on current path
  if (!isLoading && (!session || !session.authenticated)) {
    // Determine which login page to redirect to based on current path
    if (window.location.pathname.includes('/franchisor')) {
      setLocation('/login/franchisor');
    } else if (window.location.pathname.includes('/master')) {
      setLocation('/login/master_franchise');
    } else if (window.location.pathname.includes('/franchise')) {
      setLocation('/login/franchise');
    }
  }

  return {
    session,
    isLoading,
    isAuthenticated: session?.authenticated ?? false,
    personaType: session?.personaType,
    email: session?.email,
    franchiseId: session?.franchiseId,
  };
}
