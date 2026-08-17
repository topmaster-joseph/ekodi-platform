# Privacy boundary

The central Marketing ledger never stores a raw customer name, phone number or email address. A customer reference may enter a trusted API request but is normalized only in memory and transformed with a private workspace salt before persistence. Admin APIs return relationship aggregates and never return the persisted pseudonym.
