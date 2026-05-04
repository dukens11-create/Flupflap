"use client";
import { useState } from 'react';

type Item={id:string,title:string,priceCents:number,imageUrl:string,shippingCents:number,quantity:number};
export default function AddToCartButton({item}:{item:Omit<Item,'quantity'>}){const [done,setDone]=useState(false);function add(){const raw=localStorage.getItem('flupflap_cart');const cart:Item[]=raw?JSON.parse(raw):[];const existing=cart.find(i=>i.id===item.id);if(existing) existing.quantity+=1; else cart.push({...item,quantity:1});localStorage.setItem('flupflap_cart',JSON.stringify(cart));setDone(true);}return <button onClick={add} className="btn-dark w-full">{done?'Added to cart':'Add to cart'}</button>}
