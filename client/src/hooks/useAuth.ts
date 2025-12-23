import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  // First check if persona (franchisor/franchise) is logged in
  const { data: personaUser, isLoading: personaLoading } = useQuery<any>({
    queryKey: ["/api/auth/persona/session"],
    queryFn: getQueryFn<any>({ on401: "returnNull" }),
    retry: false,
  });

  // Convert persona response to user object if authenticated
  let user: User | null = null;
  if (personaUser?.authenticated) {
    user = {
      id: personaUser.email,
      name: personaUser.email.split('@')[0],
      email: personaUser.email,
      personaType: personaUser.personaType,
    } as User;
  }

  return {
    user,
    isLoading: personaLoading,
    isAuthenticated: !!user,
  };
}
