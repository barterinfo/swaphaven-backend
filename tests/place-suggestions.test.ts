import { describe, expect, it } from "vitest";
import {
  classifyNominatimHit,
  fallbackPlaceQueries,
  queryHasUnit,
  type NominatimHit,
} from "../src/lib/place-suggestions.js";
import { publicMapPin, snapToNeighbourhoodCell } from "../src/lib/map-pin.js";

function hit(partial: Partial<NominatimHit> & Pick<NominatimHit, "displayName">): NominatimHit {
  return {
    lat: 1.35,
    lng: 103.76,
    className: "place",
    type: "suburb",
    address: {},
    countryCode: "SG",
    ...partial,
  };
}

describe("queryHasUnit", () => {
  it("detects unit tokens and stack numbers", () => {
    expect(queryHasUnit("0505, block 27 Hillview Heights")).toBe(true);
    expect(queryHasUnit("apt 12 Hillview")).toBe(true);
    expect(queryHasUnit("unit #05-12")).toBe(true);
    expect(queryHasUnit("01-05 Hillview")).toBe(true);
    expect(queryHasUnit("Hillview MRT")).toBe(false);
    expect(queryHasUnit("block 27 Hillview Heights")).toBe(false);
  });
});

describe("fallbackPlaceQueries", () => {
  it("retries blk/block and MRT spellings Nominatim misses", () => {
    expect(fallbackPlaceQueries("Blk 123 Ang Mo Kio")).toContain("123 Ang Mo Kio");
    expect(fallbackPlaceQueries("Gardens by the Bay MRT")).toContain(
      "Gardens by the Bay",
    );
    expect(fallbackPlaceQueries("Hillview Heights")).toEqual([]);
  });
});

describe("classifyNominatimHit", () => {
  it("rejects unit queries", () => {
    expect(
      classifyNominatimHit(
        hit({ displayName: "Hillview Heights", address: { suburb: "Hillview" } }),
        "0505, block 27 Hillview Heights",
      ),
    ).toBeNull();
  });

  it("keeps an HDB block selectable by block and area, with an area pin", () => {
    const suggestion = classifyNominatimHit(
      hit({
        displayName: "Block 27, Hillview Heights, Singapore",
        className: "building",
        type: "apartments",
        address: { house_number: "27", suburb: "Hillview", country_code: "sg" },
      }),
      "block 27 Hillview Heights",
    );
    expect(suggestion).toEqual(
      expect.objectContaining({
        label: "Block 27, Hillview",
        pinKind: "area",
        placeType: "HDB · Hillview",
      }),
    );
  });

  it("keeps a numbered HDB block selectable by block and road", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName:
            "123, Ang Mo Kio Avenue 3, Kebun Bahru, Ang Mo Kio, Singapore",
          className: "building",
          type: "residential",
          address: {
            house_number: "123",
            road: "Ang Mo Kio Avenue 3",
            neighbourhood: "Kebun Bahru",
            suburb: "Ang Mo Kio",
          },
        }),
        "Blk 123 Ang Mo Kio",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "Block 123, Ang Mo Kio Avenue 3",
        pinKind: "area",
        placeType: "HDB · Ang Mo Kio",
      }),
    );
  });

  it("keeps a landmark venue even when it has a house number", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName: "Marina Bay Sands, 10, Bayfront Avenue, Civic District, Singapore",
          className: "tourism",
          type: "hotel",
          address: {
            house_number: "10",
            road: "Bayfront Avenue",
            suburb: "Civic District",
          },
        }),
        "Marina Bay Sands",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "Marina Bay Sands",
        pinKind: "venue",
        placeType: "Hotel · Civic District",
      }),
    );
  });

  it("keeps an MRT station venue even when it has a house number", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName:
            "Gardens by the Bay, 11, Marina Gardens Drive, Marina South, Singapore",
          className: "railway",
          type: "station",
          address: {
            house_number: "11",
            suburb: "Marina South",
          },
          lat: 1.2815,
          lng: 103.8685,
        }),
        "Gardens by the Bay MRT",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "Gardens by the Bay",
        pinKind: "venue",
        placeType: "Station · Marina South",
      }),
    );
  });

  it("keeps a mall venue even when it has a house number", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName: "HDB Hub, 480, Lorong 6 Toa Payoh, Toa Payoh, Singapore",
          className: "shop",
          type: "mall",
          address: { house_number: "480", suburb: "Toa Payoh" },
        }),
        "HDB Hub",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "HDB Hub",
        pinKind: "venue",
        placeType: "Shopping Mall · Toa Payoh",
      }),
    );
  });

  it("keeps a public station as a venue and shows its area", () => {
    const suggestion = classifyNominatimHit(
      hit({
        displayName: "Hillview, Singapore",
        className: "railway",
        type: "station",
        address: { railway: "Hillview MRT", suburb: "Hillview" },
        lat: 1.3624,
        lng: 103.7675,
      }),
      "Hillview MRT",
    );
    expect(suggestion).toEqual(
      expect.objectContaining({
        label: "Hillview MRT",
        pinKind: "venue",
        placeType: "Station · Hillview",
        lat: 1.3624,
        lng: 103.7675,
      }),
    );
  });

  it("maps several suburb hits for the same name to one selectable label", () => {
    const a = classifyNominatimHit(
      hit({
        displayName: "Bukit Batok, Singapore",
        type: "suburb",
        address: { suburb: "Bukit Batok" },
        lat: 1.349,
        lng: 103.75,
      }),
      "Bukit Batok",
    );
    const b = classifyNominatimHit(
      hit({
        displayName: "Bukit Batok, Singapore",
        type: "suburb",
        address: { suburb: "Bukit Batok" },
        lat: 1.351,
        lng: 103.752,
      }),
      "Bukit Batok",
    );
    expect(a?.label).toBe("Bukit Batok");
    expect(b?.label).toBe("Bukit Batok");
    expect(a?.pinKind).toBe("area");
    expect(b?.pinKind).toBe("area");
  });

  it("rejects unknown classes", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName: "Somewhere",
          className: "highway",
          type: "residential",
          address: {},
        }),
        "Somewhere",
      ),
    ).toBeNull();
  });

  it("keeps a condo estate selectable by name, with an area pin", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName:
            "Hillview Heights, Bukit Batok, West Region, Singapore, 669561, Singapore",
          className: "landuse",
          type: "residential",
          address: {
            suburb: "Bukit Batok",
            city: "Singapore",
            postcode: "669561",
            country_code: "sg",
          },
        }),
        "Hillview Heights",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "Hillview Heights",
        pinKind: "area",
        placeType: "Condo · Bukit Batok",
      }),
    );
  });

  it("accepts Singapore planning areas (boundary/administrative)", () => {
    expect(
      classifyNominatimHit(
        hit({
          displayName: "Bukit Batok, West Region, Singapore",
          className: "boundary",
          type: "administrative",
          address: {
            suburb: "Bukit Batok",
            borough: "West Region",
            city: "Singapore",
            country_code: "sg",
          },
          lat: 1.349,
          lng: 103.75,
        }),
        "bukit batok",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "Bukit Batok",
        pinKind: "area",
        placeType: "Neighbourhood",
      }),
    );

    expect(
      classifyNominatimHit(
        hit({
          displayName: "Bukit Panjang, West Region, Singapore",
          className: "boundary",
          type: "administrative",
          address: {
            suburb: "Bukit Panjang",
            city: "Singapore",
            country_code: "sg",
          },
        }),
        "bukit panjang",
      ),
    ).toEqual(
      expect.objectContaining({
        label: "Bukit Panjang",
        pinKind: "area",
      }),
    );
  });
});

describe("publicMapPin", () => {
  it("snaps to a ~100 m cell (0.0009 degrees)", () => {
    expect(snapToNeighbourhoodCell(1.3521, 103.8198)).toEqual({
      lat: 1.35225,
      lng: 103.81995,
    });
  });

  it("snaps area and legacy null kinds to the neighbourhood cell", () => {
    const cell = snapToNeighbourhoodCell(1.3521, 103.8198);
    expect(publicMapPin({ lat: 1.3521, lng: 103.8198, pinKind: "area" })).toEqual({
      ...cell,
      precision: "area",
    });
    expect(publicMapPin({ lat: 1.3521, lng: 103.8198, pinKind: null })).toEqual({
      ...cell,
      precision: "area",
    });
  });

  it("keeps venue coordinates", () => {
    expect(publicMapPin({ lat: 1.3624, lng: 103.7675, pinKind: "venue" })).toEqual({
      lat: 1.3624,
      lng: 103.7675,
      precision: "venue",
    });
  });
});
