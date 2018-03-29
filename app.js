var express               = require("express");
var bodyParser            = require("body-parser");
var request               = require("request");
var mongoose              = require("mongoose");
var passport              = require("passport");
var LocalStrategy         = require("passport-local");
var passportLocalMongoose = require("passport-local-mongoose");
var methodOverride        = require("method-override");
var session               = require("express-session");


mongoose.connect("mongodb://localhost:/auctiondb");


var app = express();

app.set("view engine","ejs");
app.use(methodOverride("_method"));
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));

var productSchema = new mongoose.Schema({
    
    prod_name : String,
    prod_base_price : Number,
    prod_current_price: Number,
    prod_current_winner_id: String,
    prod_owner_id: String,
    prod_bidder_list : [String],
    prod_bid_values: [Number],
    prod_desc:String
    
});

var Product = mongoose.model("Product",productSchema);

var userSchema = new mongoose.Schema({
    
    username : String,
    user_password : String,
    user_email: String,
    user_wallet: Number,
    auc_products: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product"
            }
        ],
    my_bid_products: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product"
            }
        ],
    my_bid_values: [Number]
});

userSchema.plugin(passportLocalMongoose);

var User = mongoose.model("User",userSchema);

app.use(require("express-session")({
    secret: "this is online auction",
    resave:false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(function(req,res,next){
    res.locals.currentUser = req.user;
    next();
});

function isLoggedIn(req,res,next){
    if(req.isAuthenticated()){
        return next();
    }
    res.redirect("/login");
}

function checkOwnership(req,res,next){
    if(req.isAuthenticated()){
        Product.findById(req.params.id,function(err, product) {
            if(err){
                console.log("1:"+err)
                res.redirect("back");
                
            }else{
                if(req.user._id.equals(product.prod_owner_id)){
                    console.log("2")
                    next(); 
                }else{
                    console.log("3")
                    res.redirect("back");
                }
            }
        });
    }else{
        console.log("4");
        res.redirect("back");
    }
}

app.get("/",function(req,res){
    res.render("home.ejs");
});
app.get("/products",function(req,res){
    Product.find({},function(err,products){
        if(err){
            console.log("Cannot find any products");
            console.log(err);
        }else{
            console.log("Access granted");
            console.log(products);
            res.render("all_products.ejs",{products:products});
        }
    });
    
});

app.get("/products/new",isLoggedIn,function(req,res){
    res.render("new_product.ejs");
});

app.post("/products",isLoggedIn,function(req,res){
    Product.create({
        prod_name: req.body.prod_name,
        prod_base_price : req.body.prod_base_price,
        prod_current_price : req.body.prod_base_price,
        prod_owner_id: req.user._id,
        prod_desc: req.body.prod_desc
    },function(err,product){
        if(err){
            console.log("Error creating the product");
            console.log(err);
        }else{
            User.findOne({username:req.user.username},function(err,user){
                if(err){
                    console.log("Error finding the user.");
                    console.log(err);
                }else{
                    console.log(user)
                    user.auc_products.push(product);
                    user.save(function(err,data){
                        if(err){
                            console.log("Error saving the changed user");
                            console.log(err);
                        }else{
                            console.log("Saved successfully");
                            console.log(data);
                        }
                    });
                }
            });
        }
    });
    
    

    res.redirect("/products");
});





app.get("/products/:id",function(req,res){
    var id = req.params.id;
    Product.findById(id,function(err,product){
        if(err){
            console.log("Could not find product :");
            console.log(err);
            res.redirect("/error");
        }else{
            res.render("product.ejs",{product: product});
        }
    });
});

app.get("/products/:id/edit",checkOwnership,function(req, res) {
    Product.findById(req.params.id,function(err,product){
        if(err){
            console.log("Could not find product");
            res.redirect("/products");
            console.log(err);
        }else{
            res.render("edit_product.ejs",{product: product});
        }
        
    });
    
});


app.put("/products/:id",checkOwnership,function(req,res){
    var new_product = {
        prod_name : req.body.prod_name,
        prod_base_price : req.body.prod_base_price,
        prod_current_price : req.body.prod_base_price,
        
    };
    Product.findByIdAndUpdate(req.params.id,new_product,function(err,updatedProduct){
       if(err){
           console.log(err);
       }else{
           res.redirect("/products/"+req.params.id);
       }
    });
});

app.delete("/products/:id",checkOwnership,function(req,res){
    Product.findByIdAndRemove(req.params.id,function(err){
        if(err){
            console.log(err);
        }else{
            User.findById(req.user._id,function(err,user){
                if(err){
                    console.log("could not find user : "+ err);
                    
                }else{
                    
                    var i = 0 ,  flag = 0;
                    for( i=0 ; i < user.auc_products.length ; i++ )
                    {
                        if(user.auc_products[i].equals(req.params.id)){
                            flag =1;
                            break;
                        }
                    }
                    if(flag==-1){
                        console.log("could not find product in users cart")
                    }else{
                        user.auc_products.splice(i,1);
                    }
                    console.log(user);
                    User.findByIdAndUpdate(req.user._id,user,function(err,updatedUser){
                        if(err){
                            console.log(err)
                        }else{
                            console.log(updatedUser);
                        }
                    })
                    
                }
            })
            res.redirect("/products");
        }
    });
});



app.put("/bid/:id",isLoggedIn,function(req,res){
    User.findById(req.user._id,function(err,user){
        if(err){
            console.log("User not found : " + err);
        }else{
            
            if(req.body.bid_value>user.user_wallet){
                console.log("Not enough balance");
            
            }else{
                Product.findById(req.params.id,function(err, product) {
                    if(err){
                        console.log(err);
                    }else{
                        var old_winner_id = product.prod_current_winner_id;
                        var old_winning_bid = product.prod_bid_values[product.prod_bid_values.length-1]
                        product.prod_current_price= req.body.bid_value;
                        product.prod_current_winner_id = req.user._id;
                        product.prod_bidder_list.push(req.user._id);
                        product.prod_bid_values.push(req.body.bid_value)
                        console.log("Unsaved product : " + product)
                        
                        var flag=0;
                        var i;
                        user.user_wallet = user.user_wallet - req.body.bid_value;
                        if(user.my_bid_products.length){
                            for(i=0;i<user.my_bid_products.length;i++){
                                if(user.my_bid_products[i].equals(req.params.id)){
                                    flag = 1;
                                    break;
                                }
                            }
                        }
                        if(flag==1){
                            user.my_bid_values[i] = req.body.bid_value;
                        }else{
                            user.my_bid_products.push(product);
                            user.my_bid_values.push(req.body.bid_value);
                        }
                        
                        User.findByIdAndUpdate(req.user._id,user,function(err,updatedUser){
                            if(err){
                                console.log("COULD NOT UPDATE USER AFTER BIDDING : "+err);
                            }else{
                                console.log("UPDATED USER AFTER BIDDING : " +updatedUser);
                            }
                        });
                        
                        console.log(user.user_wallet);
                        if(old_winner_id){
                            User.findById(old_winner_id,function(err, user) {
                                if(err){
                                    console.log("COULD NOT FIND OLD WINNER");
                                }else{
                                    user.user_wallet += Number(old_winning_bid)
                                    User.findByIdAndUpdate(old_winner_id,user,function(err, updatedUser) {
                                        if(err){
                                            console.log(err);
                                        }else{
                                            console.log("OLD WINNER UPDATED : "+updatedUser);
                                        }
                                    })
                                }
                            })
                        }
                        
                        
                        Product.findByIdAndUpdate(req.params.id,product,function(err,changedProd){
                            if(err){
                                console.log("not able to updated product" + err);
                            }else{
                                console.log("successfully updated product info\n"+changedProd);
                                res.redirect("/products");
                            }
                        });
                    }
                });      
            }
            
        }
    })
})
//Auth routes
app.get("/register",function(req, res) {
    res.render("register.ejs");
});

app.post("/register",function(req,res){
    var newUser = new User({
        username:req.body.username,
        
        user_email:req.body.email,
        user_wallet:req.body.deposit
    });
    User.register(newUser,req.body.password,function(err,user){
        if(err){
            console.log(err)
            return res.render("register.ejs")
        }
        passport.authenticate("local")(req,res,function(){
            res.redirect("/products");
        });
    });
});

app.get("/login",function(req, res) {
    res.render("login.ejs");
});

app.post("/login",passport.authenticate("local",{
        successRedirect: "/products",
        failureRedirect: "/login"
    
    }),function(req,res){
    
});
app.get("/logout",function(req, res) {
    
    req.logout();
    res.redirect("/");
});

app.get("/user",isLoggedIn,function(req,res){
    User.findById(req.user._id)
        .populate("auc_products")
        .populate("my_bid_products")
        .exec(function(err,user){
        if(err){
            console.log("Could not find user :" + err);
        }else{
            res.render("user_profile.ejs",{user:user});
        }
    });
});
app.post("/deposit",isLoggedIn,function(req,res){
    User.findById(req.user._id,function(err, user) {
        if(err){
            console.log(err);
        }else{
            user.user_wallet += req.body.loan_amount;
            User.findByIdAndUpdate(req.user._id,user,function(err, updatedUser) {
                if(err){
                    console.log(err);
                }else{
                    console.log(updatedUser);
                    res.redirect("/user");
                }
            });
        }
    });
});
app.get("*",function(req,res){
    res.render("error.ejs");
});




app.listen(process.env.PORT,process.env.IP,function(){
    console.log("fuckin server has started");
});





// User.create({
//     user_name: "Awasthi",
//     user_email: "raw.awas@gmail.com",
//     user_wallet: 1000000,
//     auc_products : []
// });

// Product.create({
//     prod_name: "Apple Iphone X",
//     prod_base_price: 78000
// },function(err,product){
//     if(err){
//         console.log("Error creating the product");
//         console.log(err);
//     }else{
//         User.findOne({user_name:"Awasthi"},function(err,user){
//             if(err){
//                 console.log("Error finding the user.");
//                 console.log(err);
//             }else{
//                 console.log(user)
//                 user.auc_products.push(product);
//                 user.save(function(err,data){
//                     if(err){
//                         console.log("Error saving the changed user");
//                         console.log(err);
//                     }else{
//                         console.log("Saved successfully");
//                         console.log(data);
//                     }
//                 });
//             }
//         });
//     }
// });


// Product.find({},function(err,products){
    
//     if(err){
//         console.log("Cannot find any products");
//         console.log(err);
//     }else{
//         console.log("Access granted");
//         console.log(products);
//     }
// });


// var newUser = new User({
//     user_name: "Abhishek",
//     user_id:117
    
// });
// newUser.auc_products.push({
//     prod_id: 1,
//     prod_name: "M16",
//     prod_base_price: 40000,
//     prod_current_price: 40000
// });
// newUser.my_bid_products.push({
//     prod_id: 2,
//     prod_name: "RVCE",
//     prod_base_price: 4,
//     prod_current_price: 4
// });
// newUser.my_bid_values.push(89);
// newUser.save(function(err,user){
//     if(err){
//         console.log(err);
//     }else{
//         console.log(user);
//     }
// });

// User.findOne({user_name:"Abhishek"},function(err,user){
//     if(err){
//         console.log(err);
//     }else{
//         console.log(user);
//     }
// })


// request("https://www.google.com",function(error,response,body){
//     if(error){
//         console.log("Something went wrong");
//     }else if(response.statusCode == 200 ){
//         var parsedData = JSON.parse(body);
//         console.log("request accepted");
//     }
// });

// var newProduct = new Product({
//     prod_id: 1,
//     prod_name: "M16",
//     prod_base_price: 40000,
//     prod_current_price: 40000
// });
// newProduct.save(function(err,prod){
//     if(err){
//         console.log("could not add product");
//         console.log(err);
//     }else{
//         console.log("Added successfully");
//         console.log(prod);
//     }
// });
// Product.create({
//     prod_id: 2,
//     prod_name: "RVCE",
//     prod_base_price: 4,
//     prod_current_price: 4
// });


