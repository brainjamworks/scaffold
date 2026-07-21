import { describe, expect, it } from "vite-plus/test";

import { surfaceBackgroundStyle, surfaceBackgroundStyleAttribute } from "./surface-background";

describe("surface background styles", () => {
  it("maps a non-centre image position in React and serialized styles", () => {
    const background = {
      color: "#161D77",
      imageUrl: "https://example.test/background.png",
      imagePosition: "bottom-right",
    };

    expect(surfaceBackgroundStyle(background)).toEqual({
      backgroundColor: "#161D77",
      backgroundImage: 'url("https://example.test/background.png")',
      backgroundPosition: "right bottom",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    });
    expect(surfaceBackgroundStyleAttribute(background)).toBe(
      'background-color: #161D77; background-image: url("https://example.test/background.png"); background-position: right bottom; background-repeat: no-repeat; background-size: cover',
    );
  });

  it("centres position-less images without changing their other rendering rules", () => {
    const background = {
      color: "#161D77",
      imageUrl: "https://example.test/background.png",
    };

    expect(surfaceBackgroundStyle(background)).toEqual({
      backgroundColor: "#161D77",
      backgroundImage: 'url("https://example.test/background.png")',
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    });
    expect(surfaceBackgroundStyleAttribute(background)).toBe(
      'background-color: #161D77; background-image: url("https://example.test/background.png"); background-position: center center; background-repeat: no-repeat; background-size: cover',
    );
  });
});
