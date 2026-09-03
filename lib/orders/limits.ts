/**
 * Order line limits shared by the client cart and the server order schema.
 *
 * The cart capped a line at 99 while placeOrderSchema rejected anything over
 * 50, so quantities 51-99 were accepted in the basket and refused only after
 * the diner had filled in checkout. One constant, both sides. Pure and
 * dependency-free so the client bundle can import it.
 */
export const MAX_LINE_QUANTITY = 50;
