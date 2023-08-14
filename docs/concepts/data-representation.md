# Data Representation

This solution deals with state stored in two specific locations in the application stack: the database, and the client.

- The state stored in the database (or “application state”) is considered the “source-of-truth” of the objects in the application.
- The state stored in the client (or ”local state”) is user facing (in that it is presented to the user through the UI) and is eventually consistent with the application state.

State may be modelled differently in different parts of the application stack. For example, in a database an object may be stored in a normalised schema in which the state of the object is distributed across multiple tables; whereas, in the client, the state is likely represented as a (denormalised) document or object.

```
// local state representation
{
  "title": "foo",
  "author": {
    "name": "baz"
  },
  "tags": ["a", "b"]
}

// application state representation
titles (id, title): (1, "foo")
authors (id, name): (1, "baz")
tags (id, tag): (1, "a"), (2, "b")
posts (id, title_id, author_id): (1, 1, 1)
post_tags (post_id, tag_id): (1, 1), (1, 2)
```

Additionally, the client may define some state that doesn’t have a direct correspondence with a data model persisted in the database but which is nonetheless in some way derived from the application state stored there. In the example below, the “low stock” alert is not itself stored in the database but is derived from the product quantity.

```
// local state representation
{
  "alert": "low stock",
  "product": {
    "name": "Nike Air Max",
    "category": "trainer"
  }
}

// application state representation
categories (id, category): (1, "trainer")
products (id, name, category_id): (1, "Nike Air Max", 1)
inventory (id, product_id, quantity): (1, 1, 4)
```

