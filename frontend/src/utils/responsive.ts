import { useWindowDimensions } from 'react-native';

export const useResponsive = () => {
  const { width, height } = useWindowDimensions();

  // Screen type classification
  const isSmallPhone = width < 360;
  const isTablet = width >= 600 && width < 1024;
  const isLargeScreen = width >= 1024;

  // Sizing scale bases
  const scale = width / 375; // Normalized scale based on iPhone standard width

  /**
   * Scale size relative to standard viewport width.
   * Restricts excessive sizing on tablets and large desktop web screens.
   */
  const scaleSize = (size: number, limit = 1.3) => {
    const scaled = size * scale;
    if (isLargeScreen || isTablet) {
      return size * limit;
    }
    return Math.round(scaled);
  };

  /**
   * Dynamically determine the optimal table grid column count based on viewport width.
   */
  const getTableColumns = () => {
    if (isLargeScreen) return 6;
    if (isTablet) return 5;
    if (width > 480) return 4; // Landscape or large phone screen
    return 3; // Default portrait mobile
  };

  return {
    width,
    height,
    isSmallPhone,
    isTablet,
    isLargeScreen,
    scaleSize,
    getTableColumns,
  };
};
