const express=require('express'); const searchRouter=express.Router();
searchRouter.get('/',(req,res)=>res.json({query:req.query.q||'',results:[]}));
module.exports={searchRouter};
