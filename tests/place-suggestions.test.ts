import { describe, expect, it } from "vitest";
import {
  classifyNominatimHit,
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

describe("classifyNominatimHit", () => {
  it("rejects unit queries", () => {
    expect(
      classifyNominatimHit(
        hit({ displayName: "Hillview Heights", address: { suburb: "Hillview" } }),
        "0505, block 27 Hillview Heights",
      ),
    ).toBeNull();
  });

  it("maps a block to the surrounding area", () => {
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
        label: "Hillview",
        pinKind: "area",
        placeType: "Neighbourhood",
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

  it("maps a condo estate to its surrounding neighbourhood", () => {
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
        label: "Bukit Batok",
        pinKind: "area",
        placeType: "Near Hillview Heights",
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
