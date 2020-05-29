import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('This id does not belongs to an existing customer.');
    }

    const searchProducts = await this.productsRepository.findAllById(products);

    if (!searchProducts) {
      throw new AppError('Could not find any products with given ids');
    }

    const searchProductsId = searchProducts.map(product => product.id);

    const checkNotFoundProducts = products.filter(
      product => !searchProductsId.includes(product.id),
    );

    if (checkNotFoundProducts.length) {
      throw new AppError(
        `Could not find product ${checkNotFoundProducts[0].id}`,
      );
    }

    const findProductsWithoutAvailableQuantity = products.filter(
      product =>
        searchProducts.filter(prod => prod.id === product.id)[0].quantity <=
        product.quantity,
    );

    if (findProductsWithoutAvailableQuantity.length) {
      throw new AppError(
        `The quantity ${findProductsWithoutAvailableQuantity[0].quantity}
        is not available for ${findProductsWithoutAvailableQuantity[0].id}`,
      );
    }

    const formattedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: searchProducts.filter(prod => prod.id === product.id)[0].price,
    }));

    const newOrder = await this.ordersRepository.create({
      customer: customerExists,
      products: formattedProducts,
    });

    const { order_products } = newOrder;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        searchProducts.filter(prod => prod.id === product.product_id)[0]
          .quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return newOrder;
  }
}

export default CreateOrderService;
