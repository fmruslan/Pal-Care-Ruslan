# Retail-reference research — dated snapshots, not live offers

Research batch: **2026-11-05 UTC**. Selected source fields/quotes and check timestamp are versioned in `src/lib/care/demo/catalog.ts`, to be persisted only after the [exact approval](../CARE-TEN-PRODUCT-PERSISTENCE-APPROVAL.md). Original retailer artwork/reviews and personal delivery information are not copied. No retailer policy is automatically attached to a fictional transaction.

| Care product | Selected reference and variant | USD snapshot | Source / retrieval | Match |
| --- | --- | --- | --- | --- |
| Raspberry Pi 5 | Pi 5 8GB board, SC1112, retailer SKU 8GB-9028, new | 175.00 | [PiShop.us](https://www.pishop.us/product/raspberry-pi-5-8gb/), direct page | Comparable variant: original ownership RAM unknown |
| Everyday headphones | Sony WH-CH720N/B, Black, new | 89.99 | [Sony US](https://electronics.sony.com/audio/headphones/headband/p/whch720n-b), retailer search extract; direct 403 | Comparable, not Forma F-01 |
| Pour-over kettle | Fellow Stagg stovetop, Matte Black, 1L | 89.95 | [Fellow](https://fellowproducts.com/products/stagg), direct page; selected variant sold out | Comparable, not Hearth H-02 |
| Everywhere speaker | JBL Flip 6, Black, new | 114.95 | [Walmart](https://www.walmart.com/ip/JBL-Flip-6-Portable-Waterproof-Speaker-Black/295234824), direct; seller OneCall, fulfilled by Walmart | Comparable, not Forma F-03; no safety evidence shared |
| Refrigerator | Whirlpool WRT311FZDW, White, 33-inch class, top freezer | 1,099.00 | [Home Depot](https://www.homedepot.com/p/Whirlpool-33-in-20-5-cu-ft-Wide-Top-Freezer-Refrigerator-in-White-with-Frameless-Glass-Shelves-WRT311FZDW/205658420), retailer search extract; direct 403 | Model/finish matches fictional new ownership |
| Leather boots | Timberland TB110061713, Men's Premium 6-Inch Waterproof, Wheat | 220.00 | [Timberland US](https://www.timberland.com/en-us/p/men/footwear-10039/mens-timberland-premium-6-inch-waterproof-boot-TB110061713), retailer search extract; direct 403 | Style/color; size not selected, availability unverified |
| Mattress | Zinus WMGTE-12Q, Green Tea Waterfall, Queen 12-inch | 238.00 | [Walmart](https://www.walmart.com/ip/ZINUS-12-GT-FOAM-Q/17057015205), direct; sold/shipped by Walmart.com | Model/size matches fictional new ownership |
| Hardcover book | The Design of Everyday Things, revised/expanded, ISBN 9780465050659, **paperback** | 21.99 | [Porchlight](https://www.porchlightbooks.com/products/design-of-everyday-things-revised-expanded-don-norman-9780465050659), direct page | Comparable, different book/binding from fictional hardcover |
| iPhone | iPhone 16, 6.1-inch, 128GB, Ultramarine, connect to carrier later | 829.00 | [Apple US](https://www.apple.com/shop/buy-iphone/iphone-16/6.1-inch-display-128gb-ultramarine-unlocked), direct configuration page | Model/variant; not conditional carrier “from” price |
| Video game | Tears of the Kingdom, Nintendo Switch, new physical standard edition | 56.99 | [Walmart](https://www.walmart.com/ip/The-Legend-of-Zelda-Tears-of-the-Kingdom-Nintendo-Switch/1481578625), direct; sold/shipped by Walmart.com | Platform/format/condition matches fictional new ownership |

## Retained corrections and limits

- The owner's USD 19.99 book example is a paperback, not a hardcover. Search initially repeated 19.99; the direct Porchlight page and variant JSON showed **21.99**, retained instead. No invented identical hardcover SKU.
- Refrigerator stainless-steel and white variants have different model suffixes/prices. The selected new fictional purchase is **white WRT311FZDW**; no price is transferred from WRT311FZDM. Direct access remained denied; search-extract provenance is explicit.
- A guessed Walmart game URL returned 404; search resolved the actual **1481578625** listing and its direct page confirmed 56.99. The Nintendo digital listing is not substituted for the physical game.
- Sony, Timberland and Home Depot search extracts are retailer-sourced, but **not direct-page verification**. Their limitations remain visible; later changes require a new version/review, not silent updates.
- PiShop's page has inconsistent ancillary MPN metadata; the reference uses its visible 8GB board description/SC1112 and retailer SKU, not a claim that the original unpriced Pi's variant was verified.
- Prices exclude unspecified shipping/tax and may depend on location, condition, stock or promotions. Out-of-stock listings are reference snapshots, not guaranteed purchasable offers. Marketplace retailer and actual seller are separate fields.
- None of these single snapshots proves a historical drop, same-merchant price, applicable policy, return/warranty coverage, recall status or money recovered. All purchase/eligibility accounting remains independent.
