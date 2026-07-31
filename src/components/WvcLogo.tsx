import logo from "../assets/logo.jpg";

type WvcLogoProps = {
  className?: string;
};

export function WvcLogo({ className }: WvcLogoProps) {
  return (
    <img
      src={logo}
      alt="The Creative Current"
      className={className ?? "h-12 w-12 rounded-full"}
    />
  );
}
