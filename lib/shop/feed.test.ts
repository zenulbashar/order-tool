import { describe, expect, it } from "vitest";

import { parseFeedXml } from "./feed";

/**
 * The shop feed is the one place in the product where a THIRD-PARTY parser sits
 * between a supplier document and customer-visible prices. fast-xml-parser was
 * upgraded across a major version (4 -> 5) to clear GHSA-gh4j-gqv2-49f6, and
 * every option that upgrade could have changed is one this mapping depends on:
 * a parser that coerced tag values to numbers, stopped trimming, or started
 * folding attributes into the child map would not throw — it would return an
 * empty catalogue, and the /shop page would quietly fall back to placeholders
 * with nobody the wiser.
 *
 * So these assert the PARSE CONTRACT, not the parser: given the MMT shapes the
 * real feed emits, what does a ShopProduct come out as.
 */

const product = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><MMTPriceList><Products>${inner}</Products></MMTPriceList>`;

const SIGNAGE = `<Product>
  <MMTCode>A1</MMTCode>
  <Description><ShortDescription>  50" signage display  </ShortDescription></Description>
  <Pricing><YourPrice>640.00</YourPrice><RRPInc>$899.00</RRPInc></Pricing>
  <Category><ParentCategoryName>Displays</ParentCategoryName><CategoryName>Digital signage</CategoryName></Category>
  <Files><LargeImageURL>https://cdn.test/a b.jpg</LargeImageURL></Files>
  <Availability>3</Availability>
</Product>`;

describe("parseFeedXml", () => {
  it("maps a full MMT product to the fields the shop grid renders", () => {
    const [p] = parseFeedXml(product(SIGNAGE));
    expect(p).toEqual({
      id: "A1",
      name: '50" signage display',
      price: "$899.00",
      priceValue: 899,
      costValue: 640,
      rrpValue: 899,
      category: "Displays",
      subcategory: "Digital signage",
      imageUrl: "https://cdn.test/a%20b.jpg",
      link: null,
      badge: "In stock",
      inStock: true,
    });
  });

  it("reads a SINGLE-product feed as one product, not an empty catalogue", () => {
    // fast-xml-parser returns a bare object (not a one-element array) when a tag
    // occurs once. Treating that as "not an array, therefore nothing" is the
    // classic way this integration silently empties.
    expect(parseFeedXml(product(SIGNAGE))).toHaveLength(1);
  });

  it("reads a multi-product feed as every product", () => {
    const second = SIGNAGE.replace("A1", "A2").replace(
      "50\" signage display",
      "14\" business laptop",
    );
    expect(parseFeedXml(product(SIGNAGE + second)).map((p) => p.id)).toEqual([
      "A1",
      "A2",
    ]);
  });

  it("trims the padded name rather than shipping the feed's indentation", () => {
    // trimValues: true. Without it the name carries newlines into the <h3>.
    expect(parseFeedXml(product(SIGNAGE))[0].name).toBe('50" signage display');
  });

  it("keeps tag values as strings, so a currency-prefixed price still parses", () => {
    // parseTagValue: false. RRPInc arrives as "$899.00"; parsePrice strips the
    // symbol with .replace(), which only exists on a string.
    expect(parseFeedXml(product(SIGNAGE))[0].rrpValue).toBe(899);
  });

  it("percent-encodes spaces in the image URL so <Image> gets a valid src", () => {
    expect(parseFeedXml(product(SIGNAGE))[0].imageUrl).toBe(
      "https://cdn.test/a%20b.jpg",
    );
  });

  it("drops a product with no ShortDescription instead of listing a blank card", () => {
    const nameless = `<Product><MMTCode>B1</MMTCode>
      <Pricing><RRPInc>10.00</RRPInc></Pricing></Product>`;
    expect(parseFeedXml(product(nameless))).toEqual([]);
  });

  it("marks zero availability out of stock, which excludes it from /shop", () => {
    const oos = SIGNAGE.replace("<Availability>3</Availability>", "<Availability>0</Availability>");
    const [p] = parseFeedXml(product(oos));
    expect(p.inStock).toBe(false);
    expect(p.badge).toBeNull();
  });

  it("falls back to cost when the feed carries no RRP", () => {
    const noRrp = SIGNAGE.replace("<RRPInc>$899.00</RRPInc>", "");
    const [p] = parseFeedXml(product(noRrp));
    expect(p.priceValue).toBe(640);
    expect(p.price).toBe("$640.00");
  });

  it("renders no price at all when neither amount is usable", () => {
    // An empty price string is what the card checks; a "$0.00" would advertise
    // free hardware.
    const unpriced = SIGNAGE.replace(
      "<Pricing><YourPrice>640.00</YourPrice><RRPInc>$899.00</RRPInc></Pricing>",
      "<Pricing><YourPrice>0.00</YourPrice></Pricing>",
    );
    const [p] = parseFeedXml(product(unpriced));
    expect(p.price).toBe("");
    expect(p.priceValue).toBe(0);
  });

  it("does not repeat the parent category as a subcategory", () => {
    const same = SIGNAGE.replace(
      "<CategoryName>Digital signage</CategoryName>",
      "<CategoryName>Displays</CategoryName>",
    );
    expect(parseFeedXml(product(same))[0].subcategory).toBeNull();
  });

  it("returns [] for a document that is not an MMT price list", () => {
    // A supplier auth wall serving an HTML error page must degrade to
    // placeholders, not throw inside the cached fetcher.
    expect(parseFeedXml("<html><body>Forbidden</body></html>")).toEqual([]);
  });

  it("returns [] for an empty document rather than throwing", () => {
    expect(parseFeedXml("")).toEqual([]);
  });
});
