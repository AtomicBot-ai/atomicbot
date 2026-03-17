import { useBanners } from "./BannerContext";
import { BannerCarousel } from "./BannerCarousel";

export function AppBanners() {
  const banners = useBanners();

  return (
    <>
      {/* Carousel UI */}
      <BannerCarousel items={banners} />
    </>
  );
}
