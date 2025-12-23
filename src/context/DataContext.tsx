import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ClassRoom, UploadedFile } from '../types';
import { ClassesAPI, QuizzesAPI, FilesAPI } from '../utils/api';

interface DataContextType {
  publicClasses: ClassRoom[];
  myClasses: ClassRoom[];
  documents: UploadedFile[];
  isDataLoaded: boolean;
  hasEntered: boolean;
  enterWebsite: () => void;
  prefetchAllData: (token: string) => Promise<void>;
  clearData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [publicClasses, setPublicClasses] = useState<ClassRoom[]>([]);
  const [myClasses, setMyClasses] = useState<ClassRoom[]>([]);
  const [documents, setDocuments] = useState<UploadedFile[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  // Initialize hasEntered from sessionStorage
  const [hasEntered, setHasEntered] = useState<boolean>(() => {
    return sessionStorage.getItem('hasEntered') === 'true';
  });

  const enterWebsite = () => {
    setHasEntered(true);
    sessionStorage.setItem('hasEntered', 'true');
  };

  const prefetchAllData = async (token: string) => {
    try {
      // Parallel fetch
      const [publicClassesData, myClassesData, filesData] = await Promise.all([
        ClassesAPI.listPublic(token),
        ClassesAPI.listMine(token),
        FilesAPI.listMine(token)
      ]);

      // Process Public Classes (Attach Quizzes)
      const processedPublicClasses: ClassRoom[] = [];
      for (const cls of publicClassesData) {
        const qzs = await QuizzesAPI.byClass(cls.id, token);
        const visible = (qzs || []).filter((q: any) => q.published === true);
        processedPublicClasses.push({
          id: cls.id,
          name: cls.name,
          description: cls.description,
          quizzes: visible,
          createdAt: new Date(cls.createdAt),
          updatedAt: cls.updatedAt ? new Date(cls.updatedAt) : undefined,
        } as unknown as ClassRoom);
      }

      // Process My Classes (Attach Quizzes)
      const processedMyClasses: ClassRoom[] = [];
      for (const cls of myClassesData) {
        const quizzes = await QuizzesAPI.byClass(cls.id, token);
        const isOwner = (cls as any).accessType === "owner";

        // Filter logic from ClassesPage
        if (!isOwner && quizzes.length === 0) continue;

        processedMyClasses.push({
          id: cls.id,
          name: cls.name,
          description: cls.description,
          isPublic: cls.isPublic,
          accessType: (cls as any).accessType,
          quizzes: quizzes.map((q: any) => ({
            ...q,
            createdAt: new Date(q.createdAt),
            updatedAt: new Date(q.updatedAt),
          })),
          createdAt: new Date(cls.createdAt),
          updatedAt: cls.updatedAt ? new Date(cls.updatedAt) : undefined,
        } as unknown as ClassRoom);
      }

      // Process Documents
      const processedDocuments = filesData.map((f: any) => ({
        ...f,
        uploadedAt: new Date(f.uploadedAt)
      }));

      setPublicClasses(processedPublicClasses);
      setMyClasses(processedMyClasses);
      setDocuments(processedDocuments);
      setIsDataLoaded(true);
    } catch (error) {
      // console.error("Error pre-fetching data:", error);
      throw error;
    }
  };

  const clearData = () => {
    setPublicClasses([]);
    setMyClasses([]);
    setDocuments([]);
    setIsDataLoaded(false);
    setHasEntered(false);
    sessionStorage.removeItem('hasEntered');
  };

  return (
    <DataContext.Provider value={{
      publicClasses,
      myClasses,
      documents,
      isDataLoaded,
      hasEntered,
      enterWebsite,
      prefetchAllData,
      clearData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
