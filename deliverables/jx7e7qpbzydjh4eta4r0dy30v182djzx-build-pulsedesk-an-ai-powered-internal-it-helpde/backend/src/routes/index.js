const express=require('express');
const {authRouter}=require('./auth');
const {ticketRouter}=require('./tickets');
const {searchRouter}=require('./search');
const router=express.Router();
router.use('/auth',authRouter);
router.use('/tickets',ticketRouter);
router.use('/search',searchRouter);
module.exports={router};
