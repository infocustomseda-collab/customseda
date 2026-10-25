// Reasons /api/checkout returns as ?checkout=<code>, shown above the buy form.
export const checkoutMessages: Record<string, string> = {
	invalid: "Revisa la talla, la cantidad y el envío, e inténtalo de nuevo.",
	unavailable: "Esta pieza ya no está disponible.",
	size: "La talla elegida ya no está disponible. Elige otra.",
	price: "El precio ha cambiado. Revisa el precio actualizado antes de comprar.",
	shipping: "Ese destino de envío ya no está disponible. Elige otro.",
	config: "El pago online todavía no está activo. Escríbenos para encargarla.",
	stripe: "No hemos podido abrir el pago. Inténtalo de nuevo en unos minutos.",
};

export const checkoutMessage = (reason: string | null | undefined) => (reason ? (checkoutMessages[reason] ?? checkoutMessages.stripe) : null);
