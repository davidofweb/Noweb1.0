import { useState, useEffect } from "react";
import { 
  Search, 
  MapPin, 
  Globe, 
  Phone, 
  Building2, 
  Loader2, 
  ExternalLink, 
  Info, 
  Bookmark, 
  BookmarkCheck,
  Instagram,
  Facebook,
  MessageCircle,
  History,
  LogIn,
  LogOut,
  User as UserIcon,
  Filter,
  Clock,
  Truck,
  CalendarCheck,
  Trees
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { searchBusinessesWithoutWebsites, Business } from "./services/geminiService";
import { auth, db, googleProvider, signInWithPopup, signOut } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  addDoc 
} from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./lib/firebaseUtils";

const CATEGORIES = [
  { value: "Shopping", label: "Shopping Business" },
  { value: "Barber", label: "Barber Shop" },
  { value: "Lottery", label: "Lottery House" },
  { value: "Restaurant", label: "Local Restaurant" },
  { value: "Bakery", label: "Bakery" },
  { value: "Hardware", label: "Hardware Store" },
  { value: "Florist", label: "Florist" },
  { value: "Plumber", label: "Plumbing Service" },
];

export default function App() {
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("Shopping");
  const [results, setResults] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bookmarks, setBookmarks] = useState<Business[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [view, setView] = useState<"search" | "bookmarks" | "history">("search");
  const [user, setUser] = useState<User | null>(null);
  const [activeFilters, setActiveFilters] = useState({
    isOpen: false,
    delivery: false,
    reservations: false,
    outdoorSeating: false,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setBookmarks([]);
        setHistory([]);
      }
    });
  }, []);

  // Sync Bookmarks from Firestore
  useEffect(() => {
    if (!user) return;

    const path = `users/${user.uid}/bookmarks`;
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bks = snapshot.docs.map(doc => doc.data() as Business);
      setBookmarks(bks);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync History from Firestore
  useEffect(() => {
    if (!user) return;

    const path = `users/${user.uid}/history`;
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const hist = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(hist);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView("search");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleSearch = async () => {
    if (!location) return;
    setIsLoading(true);
    setHasSearched(true);
    setView("search");
    try {
      const data = await searchBusinessesWithoutWebsites(category, location);
      setResults(data);

      // Save to history if logged in
      if (user) {
        const historyPath = `users/${user.uid}/history`;
        try {
          await addDoc(collection(db, historyPath), {
            userId: user.uid,
            category,
            location,
            resultsCount: data.length,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, historyPath);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBookmark = async (business: Business) => {
    if (!user) {
      // Fallback for guests could be local storage, but user requested Firebase login to save history
      alert("Please login to save bookmarks");
      return;
    }

    const bookmarkId = btoa(`${business.name}-${business.address}`).replace(/[/+=]/g, '');
    const bookmarkPath = `users/${user.uid}/bookmarks/${bookmarkId}`;
    const isAlreadyBookmarked = isBookmarked(business);

    try {
      if (isAlreadyBookmarked) {
        await deleteDoc(doc(db, bookmarkPath));
      } else {
        await setDoc(doc(db, bookmarkPath), {
          ...business,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, bookmarkPath);
    }
  };

  const isBookmarked = (business: Business) => {
    return bookmarks.some(b => b.name === business.name && b.address === business.address);
  };

  const filteredResults = results.filter(business => {
    if (activeFilters.isOpen && !business.attributes?.isOpen) return false;
    if (activeFilters.delivery && !business.attributes?.delivery) return false;
    if (activeFilters.reservations && !business.attributes?.reservations) return false;
    if (activeFilters.outdoorSeating && !business.attributes?.outdoorSeating) return false;
    return true;
  });

  const displayedResults = view === "bookmarks" ? bookmarks : filteredResults;

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg cursor-pointer" onClick={() => setView("search")}>
              <Globe className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">NoWeb Finder</h1>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button 
                  variant={view === "history" ? "default" : "ghost"} 
                  size="sm" 
                  onClick={() => setView("history")}
                  className="rounded-full h-9"
                >
                  <History className="mr-2 h-4 w-4" />
                  History
                </Button>
                <Button 
                  variant={view === "bookmarks" ? "default" : "ghost"} 
                  size="sm" 
                  onClick={() => setView("bookmarks")}
                  className="rounded-full h-9"
                >
                  <Bookmark className={cn("mr-2 h-4 w-4", view === "bookmarks" && "fill-current")} />
                  Saved ({bookmarks.length})
                </Button>
                <Separator orientation="vertical" className="h-6 mx-1" />
                <div className="flex items-center gap-3 pl-2">
                  <div className="flex flex-col items-end hidden md:flex">
                    <span className="text-xs font-bold leading-none">{user.displayName}</span>
                    <span className="text-[10px] text-muted-foreground">{user.email}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full overflow-hidden border bg-muted" onClick={handleLogout}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="pro" className="h-full w-full object-cover" />
                    ) : (
                      <UserIcon className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" className="rounded-full shadow-lg" onClick={handleLogin}>
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
        {/* Hero Section */}
        <div className="mb-12 text-center md:text-left">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            {view === "bookmarks" ? "Your Bookmarked Leads" : view === "history" ? "Your Search History" : (
              <>Find businesses <span className="text-muted-foreground">without a digital home.</span></>
            )}
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">
            {view === "bookmarks" 
              ? "Keep track of the businesses you want to reach out to. Your bookmarks are synced across devices."
              : view === "history"
              ? "A complete record of your past searches and potential opportunities."
              : "Discover local businesses that haven't established an online presence yet. Perfect for digital agencies, freelancers, and marketers looking to help small businesses grow."
            }
          </p>
        </div>

        {/* Search Controls - Only show in search view */}
        {view === "search" && (
          <Card className="mb-12 border-none shadow-xl shadow-black/5">
            <CardContent className="p-6">
              <div className="grid gap-6 md:grid-cols-[1fr_2fr_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-12 rounded-xl border-muted bg-muted/30 focus:ring-primary">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="City, State or Zip Code"
                      className="h-12 rounded-xl border-muted bg-muted/30 pl-12 focus:ring-primary"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <Button 
                    variant={showFilters ? "secondary" : "outline"}
                    className="h-12 w-12 rounded-xl p-0 md:w-auto md:px-4"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-5 w-5 md:mr-2" />
                    <span className="hidden md:inline">Filters</span>
                  </Button>
                  <Button 
                    className="h-12 w-full rounded-xl px-8 font-semibold shadow-lg shadow-primary/20 md:w-auto flex-1 md:flex-none"
                    onClick={handleSearch}
                    disabled={isLoading || !location}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-5 w-5" />
                    )}
                    Search
                  </Button>
                </div>
              </div>

              {/* Advanced Filters */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Separator className="my-6" />
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <Button
                        variant={activeFilters.isOpen ? "default" : "outline"}
                        className="h-10 rounded-lg text-xs"
                        onClick={() => setActiveFilters(f => ({ ...f, isOpen: !f.isOpen }))}
                      >
                        <Clock className="mr-2 h-3.5 w-3.5" />
                        Currently Open
                      </Button>
                      <Button
                        variant={activeFilters.delivery ? "default" : "outline"}
                        className="h-10 rounded-lg text-xs"
                        onClick={() => setActiveFilters(f => ({ ...f, delivery: !f.delivery }))}
                      >
                        <Truck className="mr-2 h-3.5 w-3.5" />
                        Delivery
                      </Button>
                      <Button
                        variant={activeFilters.reservations ? "default" : "outline"}
                        className="h-10 rounded-lg text-xs"
                        onClick={() => setActiveFilters(f => ({ ...f, reservations: !f.reservations }))}
                      >
                        <CalendarCheck className="mr-2 h-3.5 w-3.5" />
                        Reservations
                      </Button>
                      <Button
                        variant={activeFilters.outdoorSeating ? "default" : "outline"}
                        className="h-10 rounded-lg text-xs"
                        onClick={() => setActiveFilters(f => ({ ...f, outdoorSeating: !f.outdoorSeating }))}
                      >
                        <Trees className="mr-2 h-3.5 w-3.5" />
                        Outdoor Seating
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {isLoading ? "Searching..." : view === "bookmarks" ? `Saved Leads (${bookmarks.length})` : view === "history" ? `Past Searches (${history.length})` : hasSearched ? `Found ${results.length} Results` : "Ready to search"}
            </h3>
            {hasSearched && !isLoading && results.length > 0 && view === "search" && (
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] font-bold uppercase">
                Verified by AI
              </Badge>
            )}
          </div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid gap-6 md:grid-cols-2"
              >
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="overflow-hidden border-none shadow-md">
                    <CardHeader className="space-y-2">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            ) : view === "history" ? (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-4"
              >
                {history.length > 0 ? history.map((item) => (
                  <Card key={item.id} className="border-none shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => {
                    setCategory(item.category);
                    setLocation(item.location);
                    handleSearch();
                  }}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <History className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold">{item.category} in {item.location}</p>
                          <p className="text-xs text-muted-foreground">{item.resultsCount} results • {item.createdAt?.toDate().toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-full">Re-run Search</Button>
                    </CardContent>
                  </Card>
                )) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <History className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Your search history is empty.</p>
                  </div>
                )}
              </motion.div>
            ) : displayedResults.length > 0 ? (
              <motion.div 
                key={view === "bookmarks" ? "bookmarks" : "results"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-6 md:grid-cols-2"
              >
                {displayedResults.map((business, index) => (
                  <motion.div
                    key={`${business.name}-${index}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="group h-full border-none shadow-md transition-all hover:shadow-xl hover:shadow-black/5">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <CardTitle className="text-xl font-bold leading-tight group-hover:text-primary">
                              {business.name}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              {business.category}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-full"
                              onClick={() => toggleBookmark(business)}
                            >
                              {isBookmarked(business) ? (
                                <BookmarkCheck className="h-5 w-5 text-primary fill-current" />
                              ) : (
                                <Bookmark className="h-5 w-5 text-muted-foreground" />
                              )}
                            </Button>
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400">
                              No Website
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{business.address}</span>
                          </div>
                          {business.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 shrink-0" />
                              <span>{business.phone}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Attributes/Features */}
                        <div className="flex flex-wrap gap-1.5">
                          {business.attributes?.isOpen && (
                            <Badge variant="outline" className="h-6 border-green-200 bg-green-50 text-[10px] text-green-700">
                              <Clock className="mr-1 h-3 w-3" />
                              Open Now
                            </Badge>
                          )}
                          {business.attributes?.delivery && (
                            <Badge variant="outline" className="h-6 border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                              <Truck className="mr-1 h-3 w-3" />
                              Delivery
                            </Badge>
                          )}
                          {business.attributes?.reservations && (
                            <Badge variant="outline" className="h-6 border-purple-200 bg-purple-50 text-[10px] text-purple-700">
                              <CalendarCheck className="mr-1 h-3 w-3" />
                              Reservations
                            </Badge>
                          )}
                          {business.attributes?.outdoorSeating && (
                            <Badge variant="outline" className="h-6 border-orange-200 bg-orange-50 text-[10px] text-orange-700">
                              <Trees className="mr-1 h-3 w-3" />
                              Outdoor Seating
                            </Badge>
                          )}
                        </div>

                        {/* Social Media Links */}
                        {business.socialMedia && (
                          <div className="flex flex-wrap gap-2">
                            {business.socialMedia.instagram && (
                              <a 
                                href={business.socialMedia.instagram} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 text-[10px] font-semibold text-pink-600 transition-colors hover:bg-pink-100"
                              >
                                <Instagram className="h-3 w-3" />
                                Instagram
                              </a>
                            )}
                            {business.socialMedia.facebook && (
                              <a 
                                href={business.socialMedia.facebook} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-semibold text-blue-600 transition-colors hover:bg-blue-100"
                              >
                                <Facebook className="h-3 w-3" />
                                Facebook
                              </a>
                            )}
                            {business.socialMedia.whatsapp && (
                              <a 
                                href={business.socialMedia.whatsapp} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-[10px] font-semibold text-green-600 transition-colors hover:bg-green-100"
                              >
                                <MessageCircle className="h-3 w-3" />
                                WhatsApp
                              </a>
                            )}
                          </div>
                        )}

                        {business.notes && (
                          <div className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                            <div className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-tighter text-foreground/70">
                              <Info className="h-3 w-3" />
                              Insights
                            </div>
                            {business.notes}
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="grid grid-cols-2 gap-2 pt-0">
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${business.address}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "w-full rounded-xl border-muted hover:bg-primary hover:text-primary-foreground"
                          )}
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Maps
                        </a>
                        <Button 
                          variant="outline" 
                          className="rounded-xl border-muted hover:bg-primary hover:text-primary-foreground"
                          onClick={() => {
                            const text = `Hi ${business.name}, I noticed you don't have a website and I'd love to help you build one!`;
                            const mailto = `mailto:?subject=Helping ${business.name} grow online&body=${encodeURIComponent(text)}`;
                            window.location.href = mailto;
                          }}
                        >
                          <Phone className="mr-1.5 h-3.5 w-3.5" />
                          Contact
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            ) : view === "bookmarks" ? (
              <motion.div 
                key="empty-bookmarks"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                  <Bookmark className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold">No bookmarks yet</h3>
                <p className="max-w-xs text-muted-foreground">
                  Save businesses you're interested in by clicking the bookmark icon on their card.
                </p>
                <Button variant="link" onClick={() => setView("search")} className="mt-4">
                  Back to search
                </Button>
              </motion.div>
            ) : hasSearched ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                  <Search className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold">No results found</h3>
                <p className="max-w-xs text-muted-foreground">
                  We couldn't find any businesses without websites in this area. Try a different category or location.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="initial"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-xl shadow-black/5">
                  <Globe className="h-12 w-12 text-primary/20" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight">Start your search</h3>
                <p className="max-w-sm text-muted-foreground">
                  Enter a location and select a category to find businesses that need your digital expertise.
                </p>
                {!user && (
                  <Button variant="outline" className="mt-6 rounded-full" onClick={handleLogin}>
                    Login to sync search history
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="font-bold tracking-tight">NoWeb Finder</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} NoWeb Finder. Powered by Gemini AI.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-primary">Privacy</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-primary">Terms</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-primary">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
