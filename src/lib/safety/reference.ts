import type { RecallSource } from "./cpsc";
export const REVIEWED_SOURCE_HASH =
  "3c0615328acfa6a6b718d72ec89f221d92e8be41e2205728b908ea55ad2455c9";
// Selected exact fields from actual official API retrieval. Not an invented recall.
// Selection is intentional: no consumer/payer or personal documents are stored.
export const referenceSource: RecallSource = {
  RecallID: 9892,
  RecallNumber: "24159",
  RecallDate: "2024-03-14T00:00:00",
  LastPublishDate: "2024-03-14T00:00:00",
  Title:
    "Best Buy Recalls Insignia® Air Fryers and Air Fryer Ovens Due to Fire, Burn and Laceration Hazards",
  Description:
    "This recall involves Insignia Air Fryers and Insignia Air Fryer Ovens, model numbers NS-AF34D2, NS-AF5DSS2, NS-AF5MSS2, NS-AF8DBD2, NS-AF10DBK2, and NS-AF10DSS2. The brand name INSIGNIA is on the top or front of each unit. A product rating label on the underside of each unit identifies the brand INSIGNIA and the model number. The air fryers and air fryer ovens have cooking chamber capacities ranging from about 3.4 to 10 quarts, and plastic or plastic and stainless-steel bodies in black and stainless-steel finishes.",
  URL: "https://www.cpsc.gov/Recalls/2024/Best-Buy-Recalls-Insignia-Air Fryers-and-Air-Fryer-Ovens-Due-to-Fire-Burn-and-Laceration-Hazards",
  Hazards: [
    {
      Name: "The air fryers can overheat, causing the handles to melt or break, posing fire and burn hazards. Additionally, the air fryer ovens can overheat and the glass on the door can shatter, posing fire, burn and laceration hazards.",
    },
  ],
  Remedies: [
    {
      Name: "Consumers should immediately stop using the recalled Insignia air fryers and air fryer ovens and visit https://www.recallrtr.com/airfryer for instructions on how to submit photos of the recalled unit(s), the model number, purchase receipt, and on the destruction of the unit. Consumers can receive a refund in the form of a refund check or a Best Buy store credit. A consumer will receive the amount on the purchase receipt, or they will receive the average sales price for the model if no receipt is provided. Consumers should not return the recalled air fryers or air fryer ovens to Best Buy stores. Best Buy has contacted all known purchasers directly.",
    },
  ],
};
// Explicit coding-agent source review: exact models for THIS revision only.
// Not physical product verification or an independent human safety certification.
export const reviewedModels = [
  "NS-AF34D2",
  "NS-AF5DSS2",
  "NS-AF5MSS2",
  "NS-AF8DBD2",
  "NS-AF10DBK2",
  "NS-AF10DSS2",
];
export const fictionalOwnership = {
  name: "Insignia air fryer · sample ownership",
  brand: "Insignia",
  model: "NS-AF34D2",
  identifiersVerified: false,
};
