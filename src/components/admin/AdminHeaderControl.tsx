import { useState } from "react";
import { useNavigate } from "react-router";
import { LogIn, ShieldCheck, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LoginDialog from "@/components/admin/LoginDialog";

export default function AdminHeaderControl() {
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);

  if (!isAdmin) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setLoginOpen(true)}
          aria-label="Sign In"
        >
          <LogIn size={14} />
          <span className="hidden sm:inline">Sign In</span>
        </Button>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0" aria-label="Admin menu">
          <ShieldCheck size={14} className="text-primary" />
          <span className="hidden sm:inline">Admin</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signed in as admin</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/admin")}>
          <Settings size={14} />
          Open Admin
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            logout();
            navigate("/");
            toast.success("Signed out");
          }}
        >
          <LogOut size={14} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
