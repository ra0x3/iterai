/**
 * Type of improvement/refinement applied to a node
 */
export enum ImprovementType {
  STANDARD = "standard",
  SYNTHETIC = "synthetic",
}

/**
 * A single step in a plan with order and text description
 */
export class Step {
  public order: number;
  public text: string;

  constructor(order: number, text: string) {
    this.order = order;
    this.text = text;
  }

  toDict(): { order: number; text: string } {
    return {
      order: this.order,
      text: this.text,
    };
  }

  static fromDict(data: { order: number; text: string }): Step {
    return new Step(data.order, data.text);
  }
}
