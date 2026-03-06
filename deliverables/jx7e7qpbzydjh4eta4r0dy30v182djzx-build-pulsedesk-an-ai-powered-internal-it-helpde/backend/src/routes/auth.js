const express=require('express'); const jwt=require('jsonwebtoken');
const authRouter=express.Router();
authRouter.post('/login',(req,res)=>{const token=jwt.sign({sub:req.body.email,role:'agent'},process.env.JWT_SECRET||'dev',{expiresIn:'7d'});res.json({token});});
authRouter.post('/register',(_,res)=>res.status(201).json({ok:true}));
module.exports={authRouter};
